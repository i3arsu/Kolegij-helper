# Plan: aplikacija za praćenje studenata na kolegiju (self-hosted)

## Kontekst

Nastavnik danas prati dolaznost, bodove i predaje ručno. Cilj je jedna web aplikacija:
- nastavnik/asistent vide studente uvezene iz CSV-a, vode dolaznost, zadaju i ocjenjuju zadatke te daju povratnu informaciju u više krugova;
- student vidi samo svoje podatke.

**Ograničenja (potvrđeno):**
- Hosting je na vlastitom (sveučilišnom) serveru, sve u Dockeru; nema Supabasea ni Vercela.
- Baza je PostgreSQL u Docker kontejneru.
- Prijava je e-mailom i lozinkom. Lozinka se generira studentu pri CSV uvozu.
- Izolacija podataka studenta mora biti u bazi (Postgres RLS), ne samo u sučelju.
- Vizualni dizajn implementira se prema materijalima iz Claude Design koje dostavljate.
- Sučelje je na hrvatskom. Projekt kreće od nule.

---

## 1. Stack

| sloj | izbor | zašto |
|---|---|---|
| App | Next.js (App Router, TS), `output: 'standalone'` | jedan kontejner, SSR, Server Actions |
| Stil | Tailwind v4; tokeni iz Claude Design materijala u `@theme` | dizajn diktira izgled, ne gotova biblioteka |
| UI primitivi | Radix (headless), stilizirani prema dizajnu | pristupačnost (dijalozi, izbornici) bez nametnutog izgleda |
| Baza | PostgreSQL 17 (`postgres:17-alpine`), RLS | izolacija na razini baze |
| Migracije | SQL-first, **dbmate** (`db/migrations/*.sql`) | RLS, funkcije, view-ovi i triggeri pišu se čisto u SQL-u; SQL je jedini izvor istine |
| Upiti | **Kysely** + `kysely-codegen` (tipovi generirani iz baze) | tipizirani upiti bez druge sheme u TS-u, rade s view-ovima |
| Auth | vlastita minimalna implementacija: sesije u bazi, `@node-rs/argon2` (argon2id) | bez OAuth-a i registracije Auth.js/Better Auth su višak; potpuna kontrola i jednostavna integracija s RLS kontekstom |
| Datoteke | Docker volume `/data/datoteke`; pristup samo kroz route handler koji provjerava pravo upitom pod RLS-om | bez dodatnog servisa; MinIO je opcija ako bude više servera |
| Pozadinski poslovi (faza 4) | `worker` kontejner (isti image, `node-cron`) | obavijesti, čišćenje sesija i datoteka |
| Testovi | Vitest + Testcontainers (pravi Postgres), Playwright | RLS testovi na stvarnoj bazi, jedan toolchain |
| Ostalo | `zod`, `react-hook-form`, `papaparse`, `@tanstack/react-table`, `date-fns` + `@date-fns/tz`, `file-type`, `recharts` (faza 3), `qrcode` (faza 4) | |

**Napomene uz izbor stacka:**
1. **Odgovornosti self-hostinga:** backup baze i datoteka, TLS, ažuriranja image-a, praćenje i logovi. Sve je pokriveno u §11 (deploy).
2. **Lozinke traže punu brigu o:**
   - hashiranju (argon2id);
   - ograničenju pokušaja prijave i zaključavanju računa;
   - prisilnoj promjeni lozinke pri prvoj prijavi;
   - resetu lozinke od strane nastavnika;
   - **obaveznom HTTPS-u**.
3. **AAI@EduHr (SAML)** ostaje mogući budući dodatak; shema `korisnik` ga ne blokira.

---

## 2. Arhitektura i sigurnosni model

### Uloge u bazi (kreira ih init skripta kontejnera, lozinke su iz env-a)
| rola | služi za | prava |
|---|---|---|
| `app_owner` | vlasnik svih objekata, pokreće migracije | DDL |
| `app_user` | **svi korisnički upiti aplikacije** | `NOBYPASSRLS`, nije vlasnik tablica; samo DML grantovi |
| `app_auth` | prijava, sesije, kreiranje računa i reset lozinke | grantovi samo na `korisnik`, `sesija`, `prijava_pokusaj` |

### RLS kontekst po zahtjevu
```ts
// lib/db/index.ts
export async function kaoKorisnik<T>(korisnikId: string, fn: (tx: Transaction<DB>) => Promise<T>) {
  return db.transaction().execute(async (tx) => {
    await sql`select set_config('app.korisnik_id', ${korisnikId}, true)`.execute(tx); // true = samo ova transakcija
    return fn(tx);
  });
}
```
- `set_config(..., true)` vrijedi samo do kraja transakcije, pa je siguran i uz connection pool.
- **Bez postavljenog konteksta RLS vraća 0 redova.** Zaštita je zatvorena po zadanom: kad kod zaboravi postaviti kontekst, ne curi ništa.
- Sve tablice imaju `enable row level security`. `force` se namjerno ne koristi: `app_user` nije vlasnik tablica, pa RLS za njega uvijek vrijedi, a `security definer` pomoćne funkcije (vlasnik `app_owner`) moraju zaobići RLS da politike ne bi bile rekurzivne. Meta test provjerava da `app_user` ne posjeduje nijednu tablicu i nema `BYPASSRLS`.
- ESLint `no-restricted-imports` zabranjuje uvoz sirovog `db`-a izvan `lib/db/` i `lib/auth/`. Svi Server Components i Server Actions idu kroz `kaoKorisnik`.

### Tok podataka
- **Čitanje:** Server Components → `zahtijevajSesiju()` → `kaoKorisnik(...)` → Kysely.
- **Pisanje:** Server Actions → servisni sloj `lib/servisi/*` (poslovna pravila u TS-u) → `kaoKorisnik`.
- **Obrana u dubinu u bazi:** RLS, CHECK/EXCLUDE constrainti i trigger za prijelaze statusa predaje. Bug u aplikaciji ne može prekršiti pravila.
- **Nema javnog DB API-ja** (za razliku od Supabasea). Jedina površina napada je Next.js aplikacija, pa se QR HMAC i slične provjere smiju raditi u TS-u.

### Prijava i sesije
- **Prijava** (`/prijava`): e-mail + lozinka.
  - Usporedba se radi preko `argon2.verify`.
  - Poruka o grešci je uvijek ista ("Neispravan e-mail ili lozinka"), pa se nepoznat e-mail ne razlikuje od pogrešne lozinke.
  - Za nepoznat e-mail svejedno se izvodi lažna verifikacija, radi konstantnog vremena odgovora.
- **Ograničenje pokušaja:** nakon 5 neuspjeha unutar 15 minuta račun se zaključava na 15 minuta. Dodatno vrijedi limit po IP adresi (tablica `prijava_pokusaj`).
- **Sesija:**
  - Generira se 32 slučajna bajta. Token ide u cookie `sesija` (`HttpOnly`, `Secure`, `SameSite=Lax`).
  - U bazi se čuva samo `sha256(token)`.
  - Trajanje je klizno, 14 dana.
  - Pri prijavi se generira nova sesija.
  - Promjena lozinke poništava sve ostale sesije.
- **Prva prijava:** zastavica `mora_promijeniti_lozinku` preusmjerava na `/promjena-lozinke`. Zahtjevi: najmanje 10 znakova, ne smije biti jednaka JMBAG-u ni e-mailu.
- **Generirane lozinke:**
  - format je `xxxx-xxxx-xxxx`: 12 znakova iz 31-znakovne abecede bez dvosmislenih znakova (0/o, 1/l/i), oko 59 bita entropije;
  - generira ih `crypto.randomInt`;
  - **plaintext se nikad ne sprema.** Prikazuje se jednom nakon uvoza ili reseta, uz preuzimanje CSV-a ili PDF listića za ispis.
- **Reset:** nastavnik generira novu lozinku za studenta (postavlja se `mora_promijeniti_lozinku = true`, a sesije tog studenta se brišu). Samoposlužni reset putem e-maila dolazi u fazi 4, ako postoji SMTP.
- **CSRF:** Server Actions imaju ugrađenu provjeru Origin zaglavlja; route handleri s POST metodom provjeravaju `Origin` ručno.

---

## 3. Dizajn (Claude Design materijali)
- **Uvoz materijala:** po primitku se tokeni (boje, tipografija, razmaci, radijusi, sjene) prenose u `app/globals.css` (`@theme`). Podržavaju se svijetla i tamna tema, ako ih dizajn predviđa.
- **Komponente:** `components/ui/*` (Button, Input, Table, Badge statusa, Card, Dialog, Tabs, ProgressBar prema pragu, Timeline) grade se točno prema dizajnu. Za pristupačnost se koriste Radix primitivi.
- **Ekrani koji nisu u materijalima** (npr. čarobnjak za uvoz, QR projektorski ekran, ispis lozinki) slažu se iz istog sustava komponenti i šalju na pregled prije implementacije.
- **Redoslijed rada:** faza 1 može započeti bazom, auth-om i servisima prije stizanja materijala. Ekrani se rade kad materijali stignu. Do tada postoji neutralni privremeni UI, koji se ne polira.

---

## 4. Struktura direktorija

```
/
├─ app/
│  ├─ layout.tsx, page.tsx              # page: preusmjeravanje po ulozi
│  ├─ globals.css                       # @theme tokeni iz Claude Design
│  ├─ prijava/page.tsx, odjava/route.ts, promjena-lozinke/page.tsx
│  ├─ privatnost/page.tsx
│  ├─ nastava/                          # nastavnik + asistent
│  │  ├─ page.tsx
│  │  └─ [kolegijId]/
│  │     ├─ layout.tsx, page.tsx        # sažetak
│  │     ├─ studenti/page.tsx, studenti/[studentId]/page.tsx
│  │     ├─ uvoz/page.tsx               # čarobnjak + jednokratni prikaz lozinki
│  │     ├─ grupe/page.tsx
│  │     ├─ termini/page.tsx, termini/novi/page.tsx, termini/[terminId]/page.tsx
│  │     ├─ termini/[terminId]/qr/page.tsx                  # faza 4
│  │     ├─ zadaci/page.tsx, zadaci/novi/page.tsx, zadaci/[zadatakId]/page.tsx
│  │     ├─ zadaci/[zadatakId]/predaje/[predajaId]/page.tsx
│  │     ├─ upozorenja/page.tsx, analitika/page.tsx         # faza 3
│  │     ├─ izvoz/route.ts                                  # faza 3
│  │     └─ postavke/page.tsx
│  ├─ moj/
│  │  ├─ page.tsx
│  │  └─ [kolegijId]/page.tsx, dolaznost/page.tsx, zadaci/page.tsx, zadaci/[zadatakId]/page.tsx
│  ├─ prisutnost/[terminId]/page.tsx    # faza 4
│  └─ api/
│     ├─ datoteke/[id]/route.ts         # preuzimanje: provjera pod RLS-om → stream s diska
│     ├─ predaje/upload/route.ts        # streaming upload, limit veličine, provjera MIME-a
│     ├─ qr/[terminId]/route.ts         # faza 4
│     └─ zdravlje/route.ts              # healthcheck
├─ components/ui/, components/{tablice,forme,grafovi}/
├─ lib/
│  ├─ db/{index.ts, tipovi.ts (generirano), kontekst.ts}
│  ├─ auth/{lozinka.ts, sesija.ts, prijava.ts, generator-lozinke.ts, guard.ts}
│  ├─ servisi/{uvoz.ts, termini.ts, dolazak.ts, zadaci.ts, predaje.ts, izvoz.ts, qr.ts}
│  ├─ csv/{parsiraj.ts, validiraj.ts, usporedi.ts}
│  ├─ datoteke/spremiste.ts             # putanje, zapis/čitanje s volumena
│  └─ domena/{statusi.ts, dolaznost.ts, bodovi.ts, vrijeme.ts}
├─ db/
│  ├─ migrations/0001_…sql …            # dbmate
│  └─ init/00-uloge.sh                  # kreira app_owner/app_user/app_auth
├─ worker/index.ts                      # faza 4
├─ scripts/{seed.ts, kreiraj-admina.ts}
├─ tests/{unit,db,integracija}/, e2e/
├─ docker/{Dockerfile, Caddyfile}
├─ docker-compose.yml, docker-compose.dev.yml, .env.example
└─ .github/workflows/ci.yml (ili GitLab CI, ovisno o sveučilišnom repozitoriju)
```

---

## 5. Model podataka (SQL migracije)

Dvije izmjene u odnosu na izvorni prijedlog:
- (a) **`upis` je razdvojen** na `upis` (student × kolegij) i `clanstvo_grupe` (upis × grupa, s vremenskim rasponom). Tako student može biti u P1 i V2, a promjena grupe ne briše povijest.
- (b) **Predaja ima verzije**: jedan krug dorade odgovara jednoj verziji i jednoj povratnoj informaciji.

### 0001_osnova.sql
```sql
create extension if not exists citext;
create extension if not exists btree_gist;
create schema if not exists private;

create type tip_grupe        as enum ('predavanje','vjezbe');
create type uloga_osoblja    as enum ('nastavnik','asistent');
create type status_dolaska   as enum ('prisutan','odsutan','opravdano');
create type nacin_evidencije as enum ('rucno','qr');
create type status_predaje   as enum ('nije_predano','predano','u_pregledu','vraceno_na_doradu','prihvaceno');

create function private.trenutni_korisnik() returns uuid language sql stable as
  $$ select nullif(current_setting('app.korisnik_id', true), '')::uuid $$;
```

### 0002_korisnici.sql
```sql
create table korisnik (
  id                        uuid primary key default gen_random_uuid(),
  email                     citext not null unique,
  lozinka_hash              text not null,                 -- argon2id
  mora_promijeniti_lozinku  boolean not null default true,
  aktivan                   boolean not null default true,
  je_admin                  boolean not null default false,
  neuspjelih_prijava        int not null default 0,
  zakljucan_do              timestamptz,
  zadnja_prijava            timestamptz,
  lozinka_promijenjena_at   timestamptz,
  created_at                timestamptz not null default now()
);

create table sesija (
  id          text primary key,                              -- sha256(token), hex
  korisnik_id uuid not null references korisnik on delete cascade,
  istjece     timestamptz not null,
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index on sesija (korisnik_id);
create index on sesija (istjece);

create table prijava_pokusaj (
  id bigint generated always as identity primary key,
  email citext, ip inet, uspjeh boolean not null, created_at timestamptz not null default now()
);
create index on prijava_pokusaj (email, created_at);
create index on prijava_pokusaj (ip, created_at);

-- korisnik: app_user smije SELECT samo vlastitog reda (bez lozinka_hash kroz column grant); app_auth sve
revoke all on korisnik, sesija, prijava_pokusaj from app_user;
grant select (id, email, mora_promijeniti_lozinku, je_admin, aktivan) on korisnik to app_user;
grant select, insert, update, delete on korisnik, sesija, prijava_pokusaj to app_auth;
```

### 0003_kolegij_osobe.sql
```sql
create table osoblje (
  id          uuid primary key default gen_random_uuid(),
  korisnik_id uuid not null unique references korisnik on delete cascade,
  ime         text not null,
  prezime     text not null,
  titula      text
);

create table kolegij (
  id               uuid primary key default gen_random_uuid(),
  naziv            text not null,
  sifra            text not null,
  akademska_godina text not null check (akademska_godina ~ '^\d{4}/\d{4}$'),
  semestar         text not null check (semestar in ('zimski','ljetni')),
  arhiviran        boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (sifra, akademska_godina)
);

create table osoblje_kolegija (
  kolegij_id uuid references kolegij on delete cascade,
  osoblje_id uuid references osoblje on delete cascade,
  uloga      uloga_osoblja not null,
  primary key (kolegij_id, osoblje_id)
);
create index on osoblje_kolegija (osoblje_id);

create table grupa (
  id         uuid primary key default gen_random_uuid(),
  kolegij_id uuid not null references kolegij on delete cascade,
  naziv      text not null,
  tip        tip_grupe not null,
  unique (kolegij_id, naziv),
  unique (id, kolegij_id)
);

create table asistent_grupa (
  grupa_id   uuid references grupa on delete cascade,
  osoblje_id uuid references osoblje on delete cascade,
  primary key (grupa_id, osoblje_id)
);
create index on asistent_grupa (osoblje_id);

create table student (
  id          uuid primary key default gen_random_uuid(),
  korisnik_id uuid not null unique references korisnik on delete cascade,
  jmbag       text not null unique check (jmbag ~ '^\d{10}$'),
  ime         text not null,
  prezime     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- e-mail živi u korisnik.email (jedan izvor istine)

create table upis (
  id         uuid primary key default gen_random_uuid(),
  kolegij_id uuid not null references kolegij on delete cascade,
  student_id uuid not null references student on delete cascade,
  status     text not null default 'aktivan' check (status in ('aktivan','ispisan')),
  created_at timestamptz not null default now(),
  unique (kolegij_id, student_id)
);
create index on upis (student_id);

create table clanstvo_grupe (
  id       uuid primary key default gen_random_uuid(),
  upis_id  uuid not null references upis on delete cascade,
  grupa_id uuid not null references grupa on delete restrict,
  tip      text not null check (tip in ('predavanje','vjezbe')),   -- trigger kopira iz grupe
  vrijedi  tstzrange not null default tstzrange(now(), null),
  exclude using gist (upis_id with =, tip with =, vrijedi with &&)
);
create index on clanstvo_grupe (grupa_id);
-- trigger: grupa.kolegij_id mora = upis.kolegij_id; tip = grupa.tip

create table pravila_prolaza (
  kolegij_id               uuid primary key references kolegij on delete cascade,
  min_dolaznost_predavanja numeric(5,2) not null default 50 check (min_dolaznost_predavanja between 0 and 100),
  min_dolaznost_vjezbi     numeric(5,2) not null default 75 check (min_dolaznost_vjezbi between 0 and 100),
  min_bodova               numeric(6,2) not null default 0 check (min_bodova >= 0),
  opravdano_se_racuna      text not null default 'izuzeto'
                           check (opravdano_se_racuna in ('kao_prisutan','izuzeto','kao_odsutan')),
  updated_at               timestamptz not null default now()
);

create table uvoz (
  id uuid primary key default gen_random_uuid(),
  kolegij_id uuid not null references kolegij on delete cascade,
  autor_id uuid not null references korisnik,
  naziv_datoteke text, sazetak jsonb not null, created_at timestamptz not null default now()
);
```

### 0004_termini_dolaznost.sql
```sql
create table termin (
  id                       uuid primary key default gen_random_uuid(),
  kolegij_id               uuid not null,
  grupa_id                 uuid not null,
  pocetak                  timestamptz not null,
  kraj                     timestamptz not null check (kraj > pocetak),
  tema                     text,
  otkazan                  boolean not null default false,
  evidencija_spremljena_at timestamptz,          -- null = ne ulazi u postotak
  qr_otvoren_do            timestamptz,          -- faza 4
  created_at               timestamptz not null default now(),
  foreign key (grupa_id, kolegij_id) references grupa (id, kolegij_id) on delete cascade
);
create index on termin (grupa_id, pocetak);
create index on termin (kolegij_id, pocetak);

create table dolazak (
  termin_id       uuid references termin on delete cascade,
  student_id      uuid references student on delete cascade,
  status          status_dolaska not null,
  nacin           nacin_evidencije not null default 'rucno',
  gost            boolean not null default false,
  napomena        text,
  evidentirao     uuid references korisnik,
  evidentirano_at timestamptz not null default now(),
  primary key (termin_id, student_id)
);
create index on dolazak (student_id);

create table revizija (
  id bigint generated always as identity primary key,
  tablica text not null, kljuc jsonb not null, staro jsonb, novo jsonb,
  autor uuid default private.trenutni_korisnik(), created_at timestamptz not null default now()
);
-- triggeri na dolazak, povratna_informacija, predaja(status), korisnik(reset lozinke — bez hasha)
```

### 0005_rls_pomocne.sql
```sql
-- sve: language sql stable security definer set search_path = ''
private.moj_student_id() returns uuid      -- student where korisnik_id = trenutni_korisnik()
private.moj_osoblje_id() returns uuid
private.je_admin() returns boolean
private.je_nastavnik(k uuid) returns boolean
private.je_osoblje(k uuid) returns boolean
private.vidi_grupu(g uuid) returns boolean        -- nastavnik kolegija grupe ili asistent te grupe
private.vidi_studenta(k uuid, s uuid) returns boolean
  -- nastavnik na k, ili asistent kojem je student (ikad) bio u nekoj od njegovih grupa
grant usage on schema private to app_user;
grant execute on all functions in schema private to app_user;
```

### 0006_rls_politike.sql
Na svim tablicama: `enable row level security` (vidi §2 zašto bez `force`). Politike su `to app_user`. Tablica `revizija` nema SELECT politiku za app_user; nastavnik je čita preko `security definer` funkcije filtrirane po kolegiju.

| tablica | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| korisnik | `id = trenutni_korisnik()` ili osoblje koje `vidi_studenta` (samo id i email) | nema (app_auth) |
| osoblje | sebe; osoblje zajedničkih kolegija | admin |
| kolegij | `je_osoblje(id)` ili moj aktivni upis | INSERT admin; UPDATE `je_nastavnik` |
| osoblje_kolegija, asistent_grupa | `je_osoblje(kolegij)` | `je_nastavnik` |
| grupa | `je_osoblje(kolegij_id)` ili moje članstvo | `je_nastavnik` |
| student | `id = moj_student_id()` ili `vidi_studenta` | `je_nastavnik` na kolegiju u koji se upisuje (servis uvoza) |
| upis, clanstvo_grupe | vlastiti ili `vidi_studenta` | `je_nastavnik(kolegij_id)` |
| pravila_prolaza | osoblje + upisani student | `je_nastavnik` |
| termin | `vidi_grupu(grupa_id)` ili moje članstvo u grupi | nastavnik: sve; asistent: `vidi_grupu` |
| dolazak | `student_id = moj_student_id()` ili `vidi_grupu(termin.grupa_id)` | `vidi_grupu(...)`; student samo kroz `private.qr_prijava` (faza 4) |
| uvoz | `je_nastavnik` | `je_nastavnik` |

```sql
create policy dolazak_student_cita on dolazak for select to app_user
  using (student_id = (select private.moj_student_id()));
create policy dolazak_osoblje_cita on dolazak for select to app_user
  using (exists (select 1 from termin t where t.id = termin_id and (select private.vidi_grupu(t.grupa_id))));
create policy dolazak_osoblje_pise on dolazak for all to app_user
  using      (exists (select 1 from termin t where t.id = termin_id and private.vidi_grupu(t.grupa_id)))
  with check (exists (select 1 from termin t where t.id = termin_id and private.vidi_grupu(t.grupa_id)));
```

### 0007_viewovi_dolaznost.sql
`v_dolaznost (kolegij_id, student_id, tip, odrzano, prisutan, opravdano, odsutan, postotak, prag, zadovoljava)`, s `security_invoker = true`. Kako se računa:
- **Termini koji se broje** su oni u kojima je student bio član grupe u trenutku termina (`cg.vrijedi @> t.pocetak`), koji nisu otkazani i imaju spremljenu evidenciju.
- **Nedostajući red** u takvom terminu računa se kao odsutan.
- **Opravdano** se tretira prema pravilima kolegija.
- **Gost** se ne broji.

Ista logika postoji u `lib/domena/dolaznost.ts`; test provjerava da obje daju isti rezultat.

### Faza 2: 0010_zadaci.sql, 0011_predaje.sql
```sql
create table zadatak (
  id                    uuid primary key default gen_random_uuid(),
  kolegij_id            uuid not null references kolegij on delete cascade,
  naslov                text not null,
  opis                  text not null default '',
  rok                   timestamptz not null,
  max_bodova            numeric(6,2) not null check (max_bodova > 0),
  nacini_predaje        text[] not null default '{datoteka}'
                        check (nacini_predaje <@ array['datoteka','link','tekst'] and cardinality(nacini_predaje) > 0),
  dopusti_kasnu_predaju boolean not null default true,
  za_cijeli_kolegij     boolean not null default true,
  objavljen_at          timestamptz,
  created_by            uuid not null references korisnik,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on zadatak (kolegij_id, rok);

create table zadatak_grupa  (zadatak_id uuid references zadatak on delete cascade,
                             grupa_id uuid references grupa on delete cascade, primary key (zadatak_id, grupa_id));
create table datoteka (       -- zajednička metapodaci za priloge i predaje; sadržaj na volumenu
  id         uuid primary key default gen_random_uuid(),
  putanja    text not null unique,          -- relativno na /data/datoteke
  naziv      text not null,
  velicina   bigint not null check (velicina <= 20 * 1024 * 1024),
  mime       text not null,
  sha256     text not null,
  vlasnik    uuid not null references korisnik,
  created_at timestamptz not null default now()
);
create table zadatak_prilog (zadatak_id uuid references zadatak on delete cascade,
                             datoteka_id uuid references datoteka on delete cascade, primary key (zadatak_id, datoteka_id));
create table produzenje_roka (zadatak_id uuid references zadatak on delete cascade,
                              student_id uuid references student on delete cascade,
                              novi_rok timestamptz not null, razlog text, odobrio uuid references korisnik,
                              primary key (zadatak_id, student_id));

create table predaja (
  id               uuid primary key default gen_random_uuid(),
  zadatak_id       uuid not null references zadatak on delete cascade,
  student_id       uuid not null references student on delete cascade,
  status           status_predaje not null default 'nije_predano',
  trenutna_verzija int not null default 0,
  bodovi           numeric(6,2),
  pregledava       uuid references korisnik,
  updated_at       timestamptz not null default now(),
  unique (zadatak_id, student_id)
);
create index on predaja (student_id);
create index on predaja (zadatak_id, status);

create table predaja_verzija (
  id         uuid primary key default gen_random_uuid(),
  predaja_id uuid not null references predaja on delete cascade,
  broj       int not null check (broj >= 1),
  tekst      text,
  link       text check (link ~* '^https?://'),
  predano_at timestamptz not null default now(),
  unique (predaja_id, broj)
);
create table predaja_datoteka (verzija_id uuid references predaja_verzija on delete cascade,
                               datoteka_id uuid references datoteka on delete restrict,
                               primary key (verzija_id, datoteka_id));

create table povratna_informacija (
  id           uuid primary key default gen_random_uuid(),
  predaja_id   uuid not null references predaja on delete cascade,
  verzija_broj int not null,
  autor_id     uuid not null references korisnik,
  komentar     text not null check (length(trim(komentar)) > 0),
  bodovi       numeric(6,2) check (bodovi >= 0),     -- trigger: <= zadatak.max_bodova
  odluka       text not null check (odluka in ('vraceno_na_doradu','prihvaceno')),
  rok_dorade   timestamptz,
  created_at   timestamptz not null default now(),
  unique (predaja_id, verzija_broj)
);
create index on povratna_informacija (predaja_id);

create table predlozak_komentara (id uuid primary key default gen_random_uuid(),
  kolegij_id uuid not null references kolegij on delete cascade, naslov text not null, tekst text not null);
```

- **`v_predaja`** (`security_invoker`) radi križni spoj dodijeljenih studenata i objavljenih zadataka, s left joinom na `predaja`. Daje sljedeće stupce:
  - `status` = `coalesce(..., 'nije_predano')`;
  - `kasni` = `predano_at` verzije > efektivni rok. Za v1 efektivni rok je `coalesce(produzenje.novi_rok, zadatak.rok)`, a za vN `rok_dorade` iz prethodne povratne informacije;
  - `rok_prosao`.

  Oznaka "kasni" se **računa, ne pohranjuje**, pa produljenje roka automatski ispravlja oznaku.
- **RLS faza 2:**
  - Student: SELECT na vlastite predaje, verzije, povratne informacije i datoteke, te na objavljene i njemu dodijeljene zadatke i njihove priloge. INSERT smije samo na vlastitu `predaja`/`predaja_verzija`/`datoteka` (provjera `student_id = moj_student_id()` i dodjele zadatka). UPDATE smije samo na vlastitu predaju, a trigger ograničava prijelaze.
  - Osoblje: pristup preko `vidi_studenta`; pisanje zadataka ima samo `je_nastavnik`.
- **Datoteke:**
  - **Upload:** `POST /api/predaje/upload` provjerava sesiju i streama na disk u `tmp/`. Zatim provjerava veličinu, stvarni MIME (`file-type`, ne ekstenziju) i whitelist. Računa sha256, premješta datoteku u `{kolegij}/{zadatak}/{student}/{uuid}` i unosi red u `datoteka` pod RLS-om. Ako INSERT padne, datoteka se briše.
  - **Download:** `GET /api/datoteke/[id]` radi `select` pod `kaoKorisnik`. Ako red nije vidljiv, vraća **404** (ne 403, da se ne otkrije postojanje). Ako je vidljiv, streama datoteku s `Content-Disposition: attachment` i `X-Content-Type-Options: nosniff`.
  - Putanja se nikad ne gradi iz korisničkog unosa, pa path traversal nije moguć.

### Statusi predaje: dopušteni prijelazi
Pravila su u `lib/domena/statusi.ts` (servis). Kao druga linija obrane trigger `provjeri_prijelaz` na `predaja.status` odbija sve što nije u tablici i provjerava je li izvršitelj student ili osoblje (preko `trenutni_korisnik()`).

| iz | u | tko | uvjet / efekt |
|---|---|---|---|
| nije_predano | predano | student | zadatak objavljen i dodijeljen; prije roka ILI `dopusti_kasnu_predaju` ILI produženje; verzija = 1 |
| predano | predano | student | zamjena sadržaja iste verzije dok nitko ne pregledava |
| predano | u_pregledu | osoblje | `pregledava = ja` |
| u_pregledu | predano | osoblje | otpuštanje pregleda |
| predano, u_pregledu | vraceno_na_doradu | osoblje | obavezan komentar; opcionalno bodovi i `rok_dorade` |
| predano, u_pregledu | prihvaceno | osoblje | obavezni komentar i bodovi (≤ max) |
| vraceno_na_doradu | predano | student | verzija + 1; nakon `rok_dorade` dobiva oznaku kasni |
| prihvaceno | u_pregledu | samo nastavnik | ponovno otvaranje, zapisuje se u reviziju |

Bodovi zadatka su posljednji ne-null bodovi iz povratne informacije. Bodovi iz međukruga prikazuju se studentu kao "privremeni".

### Faza 3: 0020_analitika.sql
- `v_bodovi`.
- `v_upozorenja`: ispod praga; **rizik** (prag više nije dostižan); 3 uzastopna izostanka; nepredano nakon roka; dorada bez ponovne predaje dulje od X dana.
- `v_vremenska_crta`.

### Faza 4: 0030_qr.sql, 0031_obavijesti.sql
- **QR token** = prvih 16 bajtova `HMAC-SHA256(QR_TAJNA, termin_id:slot)`, gdje je `slot = floor(epoch/30)`. Tajna je u env-u i računa se u `lib/servisi/qr.ts`. To je sigurno jer baza nije javno dostupna.
- **Ekran** (`/api/qr/[t]`, samo osoblje koje `vidi_grupu`): vraća token i preostale sekunde; stranica ga osvježava na granici slota.
- **Student** (`/prisutnost/[t]?s=&k=`): servis provjerava da vrijedi sve od sljedećeg:
  - prijavljen je;
  - `now() <= qr_otvoren_do`;
  - slot je trenutni ili jedan od prethodna 2;
  - HMAC odgovara (`timingSafeEqual`);
  - student je član grupe termina u trenutku termina.

  Tada se poziva `private.qr_prijava(termin)` (`security definer`, ponovno provjerava članstvo i prozor), koja radi upsert `prisutan/qr`. Ručno postavljeni `opravdano` se ne prepisuje.
- **Obavijesti:** outbox `obavijest_red`. Triggeri dodaju poruke za novu povratnu informaciju i nov zadatak. Worker dnevno dodaje podsjetnike "rok za 48 h" i tjedni sažetak upozorenja nastavniku. Slanje ide preko sveučilišnog SMTP-a (nodemailer).

---

## 6. Rute i stranice po ulozi

**Javno:**
- `/prijava`.
- `/promjena-lozinke` (obavezna pri prvoj prijavi; kasnije dostupna iz izbornika).
- `/privatnost`.
- `/` preusmjerava po ulozi (osoba koja je i osoblje i student dobiva izbor).

**Nastavnik** (`/nastava/...`):
- `/nastava`: popis kolegija.
- `[k]`: sažetak.
- `[k]/studenti`: tablica s filterima (grupa, status, ispod praga, nepredani zadaci, pretraga; hrvatska kolacija).
- `[k]/studenti/[s]`: profil, dolaznost, zadaci, vremenska crta, **"Resetiraj lozinku"**.
- `[k]/uvoz`: čarobnjak učitaj → pregled razlika → potvrda → **jednokratni prikaz lozinki novih studenata** (preuzimanje CSV-a ili PDF listića za ispis; nakon napuštanja stranice lozinke se više ne mogu vidjeti).
- `[k]/grupe`: grupe i asistenti.
- `[k]/termini`: pojedinačni ili tjedni ponavljajući, otkazivanje.
- `[k]/termini/[t]`: ručna evidencija (prekidači P/O/Opr, "svi prisutni", gost, spremi).
- `[k]/zadaci` (skica/objava, prilozi, dodjela, produljenja) i `.../predaje/[p]` (pregled verzija, komentar s predlošcima, bodovi, odluka).
- `[k]/upozorenja`, `[k]/analitika`, `[k]/izvoz` (faza 3).
- `[k]/postavke`: pravila prolaza, predlošci, osoblje.

**Asistent:** iste rute. RLS sužava podatke na njegove grupe. Skriveno mu je: uvoz, reset lozinki, postavke, brisanje zadataka.

**Student** (`/moj/...`):
- `/moj`: moji kolegiji.
- `[k]`: dashboard (dolaznost P i V prema pragu, bodovi prema pragu, rokovi, zadnje povratne informacije).
- `[k]/dolaznost`.
- `[k]/zadaci`, `[k]/zadaci/[z]`: predaja i povijest verzija.
- `/prisutnost/[t]` (faza 4).

**Guardovi:**
- `proxy.ts` (Next 16; ranije `middleware.ts`) radi samo grubu provjeru: postoji li cookie sesije, inače preusmjerava na `/prijava`.
- Prava provjera je u `layout.tsx`/servisima (`zahtijevajSesiju`, `je_osoblje`) te u RLS-u.
- Tuđi ID u URL-u vraća `notFound()`.

---

## 7. CSV uvoz
- **Parsiranje:**
  - automatska detekcija separatora `;` ili `,`;
  - UTF-8 s BOM-om, s rezervom na Windows-1250 (ISVU/Excel);
  - mapiranje zaglavlja s aliasima (`JMBAG`, `Ime`, `Prezime`, `E-mail`/`Email`, `Grupa P`, `Grupa V`).
- **Validacija** (zod), na klijentu za pregled i **ponovno na serveru**: JMBAG ima točno 10 znamenki (string, vodeće nule ostaju); e-mail je ispravan; grupa postoji.
- **Pregled razlika:**
  - novi;
  - izmijenjeni (staro → novo);
  - promjena grupe (s datumom promjene);
  - nepromijenjeni;
  - **greške**: duplikat JMBAG-a u datoteci, isti e-mail s drugim JMBAG-om, e-mail koji pripada drugom korisniku, nepoznata grupa;
  - u bazi, a nema ih u datoteci (samo informacija).
- **Potvrda:** jedna transakcija koja izvršava redom:
  1. Za nove studente kreira `korisnik` s generiranom lozinkom (argon2id hash, kroz `app_auth` u istoj transakcijskoj logici servisa).
  2. Radi upsert u `student` po JMBAG-u.
  3. Radi upsert u `upis`.
  4. Mijenja članstvo u grupama.
  5. Zapisuje `uvoz.sazetak`.
- **Postojećim studentima lozinka se ne mijenja.** Ponovni uvoz iste datoteke daje 0 promjena.

## 8. Izvoz (faza 3)
CSV s BOM-om i separatorom `;`. Stupci: JMBAG, prezime, ime, grupa P, grupa V, dolaznost P %, dolaznost V %, bodovi po zadatku, ukupno, zadovoljava. Postoje varijante sažetak i detaljna matrica dolaznosti. Nastavnik izvozi sve, asistent samo svoje grupe.

---

## 9. Rubni slučajevi
1. **Student u više grupa:**
   - P + V istovremeno je normalan slučaj.
   - Dvije V grupe istovremeno blokira exclusion constraint.
   - Dolazak na termin druge grupe evidentira se kao `gost` i ne ulazi u postotak. Za nadoknadu nastavnik vlastiti izostanak označi `opravdano` s napomenom.
2. **Promjena grupe usred semestra:**
   - Staro članstvo zatvara se na datum promjene, novo se otvara od tog datuma. Povijest dolazaka ostaje.
   - Postotak se računa preko obje grupe unutar raspona članstva.
   - Student vidi zadatke svoje trenutne grupe plus sve na koje je već predao.
   - Bivši asistent zadržava pristup samo za čitanje povijesti tog studenta.
3. **Rok prošao:**
   - Predaja je dopuštena s oznakom kasni ili odbijena ("Rok za predaju je istekao"), ovisno o postavci zadatka.
   - Individualno produženje nadjačava opći rok.
   - Promjena roka automatski preračunava oznaku kasni.
   - Dorada ima vlastiti rok.
   - Vrijeme se uzima sa servera (`now()` u bazi). Rok "do 23:59" sprema se kao `23:59:59 Europe/Zagreb`; test pokriva i prijelaz na zimsko/ljetno računanje vremena.
   - Server mora imati sinkroniziran sat (NTP).
4. **Ponovni uvoz CSV-a:**
   - Upsert po JMBAG-u; ništa se ne briše.
   - Promjena e-maila mijenja `korisnik.email`, odnosno e-mail za prijavu. Nastavnik dobiva upozorenje u pregledu, a student se poslije prijavljuje novim e-mailom i istom lozinkom.
   - Ispisani student ponovno u datoteci vraća se na `aktivan`.
   - Za studenta kojeg nema u datoteci ručno se postavlja `ispisan`. Podaci ostaju, a račun se po izboru deaktivira (`aktivan = false`).
5. **Lozinke:**
   - Student zaboravi lozinku: nastavnik je resetira. Ako postoji SMTP, u fazi 4 dolazi samoposlužni reset.
   - Nastavnik izgubi preuzeti popis lozinki: radi se reset za pogođene studente (postoji i grupni reset za sve koji se nikad nisu prijavili).
   - Zaključan račun: nakon 15 minuta se otključava sam, a nastavnik ga može otključati ranije.
   - Deaktivirani račun: prijava nije moguća, sesije se brišu.
6. **Ostalo:**
   - Otkazani termin, kao i termin bez evidencije, ne ulazi u postotak (termin bez evidencije pojavljuje se kao podsjetnik u sažetku).
   - Smanjenje `max_bodova` ispod već dodijeljenih bodova je blokirano.
   - Brisanje grupe s članovima je blokirano.
   - Dva studenta istog imena razlikuju se po JMBAG-u.
   - Sortiranje koristi kolaciju `hr-HR-x-icu`.
   - Datoteke bez reda u bazi i istekle sesije briše noćni posao.
   - Pun disk: upload vraća jasnu grešku, a healthcheck prijavljuje slobodan prostor.

---

## 10. Testovi

**DB/RLS testovi** (Vitest + Testcontainers `postgres:17`; migracije i seed fiksne mini-scene; upiti preko pravog `app_user`-a i `kaoKorisnik`):
- `meta.test.ts`:
  - sve tablice u `public` imaju `relrowsecurity` i `relforcerowsecurity`;
  - `app_user` nije vlasnik nijedne tablice i nema `BYPASSRLS`;
  - `app_user` ne može čitati `korisnik.lozinka_hash`;
  - svi view-ovi su `security_invoker`;
  - sve `security definer` funkcije imaju `search_path = ''`.
- `izolacija-studenta.test.ts`, kao student A:
  - SELECT svake tablice i view-a vraća samo redove studenta A; filter po `student_id = B` vraća 0;
  - INSERT/UPDATE/DELETE nad tuđim i osobljevim podacima vraća grešku ili 0 redova;
  - student ne vidi neobjavljene zadatke ni kolegije na koje nije upisan;
  - **bez postavljenog konteksta svugdje 0 redova.**
- `asistent-opseg.test.ts`: asistent V1 ne vidi V2, ne smije pisati pravila prolaza ni uvoziti.
- `prijelazi.test.ts`: svi dopušteni prijelazi prolaze, svi ostali padaju (kombinatorno, uključujući izravni UPDATE koji trigger odbija). Pokriva i oznaku kasni s produženjem.
- `uvoz.test.ts`, `dolaznost.test.ts`, `qr.test.ts` (faza 4).

**HTTP/integracijski testovi** (Playwright `request` na podignutoj aplikaciji):
- Student A sa svojom sesijom:
  - `GET /api/datoteke/{datoteka B}` vraća 404;
  - stranice `/moj/[k]/zadaci/[z]` s tuđim ID-evima vraćaju 404;
  - Server Action predaje s tuđim `predajaId` vraća grešku;
  - `/nastava/...` vraća 404;
  - izvoz vraća 404.
- Bez sesije sve vraća preusmjeravanje na prijavu.
- Brute force: 6. pokušaj prijave je zaključan.
- Upload: datoteka > 20 MB i lažni MIME (exe preimenovan u pdf) se odbijaju.

**Unit testovi:**
- CSV (BOM, `;`, Windows-1250, dijakritike, vodeće nule), diff uvoza;
- generator lozinki (entropija, bez dvosmislenih znakova), hash i verify;
- token sesije (spremljeni su samo hashevi);
- mapa prijelaza, izračun dolaznosti i bodova, vremenske zone i DST;
- generator ponavljajućih termina.

**E2E** (Playwright, `docker compose -f docker-compose.dev.yml`): po fazi happy-path, npr. uvoz → preuzimanje lozinki → prijava studenta → prisilna promjena lozinke → dolaznost.

**CI:** lint (uključujući pravilo zabrane sirovog `db`-a), typecheck, unit testovi, DB testovi (Testcontainers), build Docker image-a, E2E.

---

## 11. Deploy (Docker)

`docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:17-alpine
    environment: [POSTGRES_PASSWORD, APP_OWNER_PASS, APP_USER_PASS, APP_AUTH_PASS]
    volumes: [pgdata:/var/lib/postgresql/data, ./db/init:/docker-entrypoint-initdb.d:ro]
    healthcheck: pg_isready
    # bez objavljenog porta prema van
  migrate:
    image: <app>
    command: dbmate --url $OWNER_DATABASE_URL up
    depends_on: { db: { condition: service_healthy } }
  app:
    image: <app>                       # Next standalone, non-root korisnik
    environment: [DATABASE_URL (app_user), AUTH_DATABASE_URL (app_auth), QR_TAJNA, APP_URL, TZ=Europe/Zagreb]
    volumes: [datoteke:/data/datoteke]
    depends_on: { migrate: { condition: service_completed_successfully } }
    healthcheck: /api/zdravlje
  worker:                              # faza 4
    image: <app>
    command: node worker/index.js
  proxy:                               # ako sveučilište nema svoj reverse proxy
    image: caddy:2
    ports: ["443:443", "80:80"]        # automatski TLS ili postojeći certifikat
volumes: { pgdata: {}, datoteke: {} }
```
- **Backup:** dnevni `pg_dump -Fc` i `rsync` volumena `datoteke` na drugu lokaciju, s rotacijom (7 dnevnih, 4 tjedna, 6 mjesečnih). **Test povrata** obavezan je prije produkcije i jednom po semestru.
- **Sigurnost:** samo HTTPS (HSTS); `.env` se ne commita (`.env.example` sadrži samo placeholdere); image se pinira na verziju; logovi ne sadrže lozinke ni sadržaj predaja.
- **`scripts/kreiraj-admina.ts`:** kreira prvog admina (e-mail iz argumenta, generirana lozinka ispisana jednom u konzolu).
- **GDPR:**
  - podaci ostaju na sveučilišnom serveru;
  - minimizacija: nema OIB-a ni adresa;
  - stranica `/privatnost`;
  - revizijski trag;
  - politika čuvanja podataka (anonimizacija nakon isteka roka, skripta u fazi 4).

---

## 12. Seed (`scripts/seed.ts`, `npm run seed`)
Seed je deterministički (fiksni PRNG), s datumima relativnim prema današnjem danu. Svi seed računi dobivaju istu dev lozinku iz `.env.example` (`SEED_LOZINKA`), uz `mora_promijeniti_lozinku = false`. **Seed se odbija pokrenuti ako je `NODE_ENV=production`.**

- **Kolegij:** "Programiranje 2" (PRG2), 2026/2027, 15 tjedana; semestar je počeo prije 6 tjedana.
- **Osoblje** (izmišljeno, `@unipu.test`): nastavnik doc. dr. sc. Marko Perić; asistentica Ivana Jurić (V2, V3); asistent Tomislav Kos (V1); admin.
- **Grupe:** P1 (svih 25), V1 (9), V2 (8), V3 (8).
- **25 studenata:** hrvatska imena (s dijakritikama), izmišljeni JMBAG-ovi `99…`, e-mailovi `ime.prezime@student.unipu.test`. Posebni slučajevi:
  - dva "Ivana Horvata";
  - jedan student prebačen iz V2 u V3 u 4. tjednu;
  - jedan ispisan;
  - jedan s `mora_promijeniti_lozinku = true` (za demo prve prijave).
- **Termini:**
  - P ponedjeljkom u 10:00, V1 utorkom u 8:00, V2 utorkom u 10:00, V3 srijedom u 12:00;
  - za proteklih 6 tjedana evidencija je spremljena;
  - 1 otkazan termin;
  - 1 prošli termin bez evidencije.
- **Dolaznost:** 18 studenata ima 90–100 %, 4 su granična (70–80 %), a 3 su ispod praga. Postoji nekoliko opravdanih izostanaka i jedan gost.
- **Zadaci:**
  - Z1 "Rekurzija": rok prošao, svi ocijenjeni, 2 kasnila.
  - Z2 "Vezane liste": rok prošao; mješavina statusa prihvaceno, dorada (od toga 1 s v2), u_pregledu, te 3 nepredana.
  - Z3 "Binarna stabla": samo V1 i V2, rok za 3 dana.
  - Z4 "Projekt": skica.
  - Uz predaje idu male lažne datoteke na volumenu.
- **Predlošci komentara:** 3. **Pravila prolaza:** P 50 %, V 75 %, min. 50 bodova.
- **CSV datoteke** u `db/podaci/`: ispravna, s greškama, te "ponovni uvoz" s 2 izmjene i 1 promjenom grupe.

---

## 13. Faze
Svaka faza završava s `docker compose up` na testnom serveru, zelenim CI-em i demo scenarijem.

**Faza 1: MVP**
- **Postavljanje:** repo, Docker Compose (db, migrate, app), init uloga, dbmate, Kysely codegen, CI, privremeni UI.
- **Migracije:** 0001–0007.
- **Funkcionalnosti:**
  - auth (prijava, sesije, ograničenje pokušaja, prisilna promjena lozinke, reset od strane nastavnika, skripta za admina);
  - preusmjeravanje po ulozi;
  - kolegij, grupe i asistenti;
  - CSV uvoz s pregledom i jednokratnim lozinkama;
  - termini;
  - ručna evidencija;
  - studentski prikaz dolaznosti;
  - pravila prolaza.
- **Dizajn:** implementacija ekrana faze 1 prema Claude Design materijalima, čim stignu.
- **Testovi:** meta, izolacija (tablice faze 1), asistent, uvoz, dolaznost, auth; E2E faze 1.
- **Završeno kad:** nastavnik uveze CSV i preuzme lozinke, student se prijavi, promijeni lozinku i vidi točan postotak, a backup i povrat su testirani.

**Faza 2: zadaci i povratne informacije**
- **Migracije:** 0010–0011.
- **Funkcionalnosti:** upload i download datoteka; zadaci (skica/objava, prilozi, dodjela, produženja); predaja (datoteka/link/tekst); red za pregled; ocjenjivanje s predlošcima; krugovi dorade; studentski prikaz.
- **Testovi:** prijelazi; izolacija proširena na predaje i datoteke; HTTP IDOR testovi; upload limiti.
- **Završeno kad:** ciklus predano → dorada → v2 → prihvaćeno radi, a student B ne može dohvatiti datoteke ni ocjene studenta A.

**Faza 3: upozorenja, analitika, izvoz**
- **Funkcionalnosti:** `v_bodovi`, `v_upozorenja`, `v_vremenska_crta`; puni sažetak; filteri; profil s vremenskom crtom; grafovi; CSV izvoz; studentske trake prema pragu.
- **Završeno kad:** 3 studenta ispod praga pojavljuju se u upozorenjima, a izvoz se ispravno otvara u Excelu s dijakritikama.

**Faza 4: QR, e-mail, više kolegija**
- **Funkcionalnosti:**
  - QR projektorski ekran i `/prisutnost`;
  - worker s outboxom i SMTP-om;
  - samoposlužni reset lozinke e-mailom;
  - postavke obavijesti;
  - prebacivanje i arhiviranje kolegija, kopiranje u novu akademsku godinu;
  - upravljanje osobljem iz UI-a;
  - skripta za čuvanje i anonimizaciju podataka.
- **Ograničenje:** QR ne sprječava prosljeđivanje fotografije koda u realnom vremenu; rotacija samo sužava prozor (vidi pitanje 8).

---

## 14. Otvorena pitanja

1. **Identifikator za prijavu:** samo e-mail ili i JMBAG? *Preporuka: e-mail, a JMBAG kao alternativa je trivijalno dodati.*
2. **Distribucija lozinki:** ispis listića na nastavi, CSV koji nastavnik šalje sam ili automatski e-mail (traži SMTP)? Postoji li sveučilišni SMTP relej koji aplikacija smije koristiti?
3. **Server:** OS i resursi, postoji li već reverse proxy i TLS certifikat (ili Caddy + Let's Encrypt), domena (npr. `pracenje.unipu.hr`), kamo idu backupi, i je li server dostupan s interneta ili samo iz sveučilišne mreže/VPN-a? To utječe na QR prijavu s mobitela.
4. **Claude Design materijali:** u kojem formatu (export koda ili mockupi) i kada stižu? Pokrivaju li sve ekrane (posebno uvoz, ocjenjivanje, studentski dashboard, QR ekran) i mobilni prikaz za studente?
5. **CSV format:** primjer stvarnog exporta (ISVU/Merlin). Sadrži li grupe?
6. **Opravdani izostanak:** računa se kao prisutan, izuzima se ili se računa kao odsutan? *Preporuka: izuzeto, uz postavku po kolegiju.*
7. **Prag dolaznosti:** nad održanim ili nad svim planiranim terminima? *Preporuka: oboje, uz upozorenje "rizik".*
8. **QR:** je li prihvatljiv rizik proslijeđene fotografije?
9. **Bodovi:** samo zadaci ili i kolokviji, ispiti i aktivnost? Jedan ukupni prag ili po kategoriji?
10. **Zadaci:** samo individualni ili i timski? *To treba odlučiti sada jer mijenja model.*
11. **Kasna predaja:** samo oznaka ili automatska penalizacija?
12. **Ovlasti asistenta:** dolaznost i ocjenjivanje za svoje grupe da, zadaci samo nastavnik? Smije li asistent resetirati lozinke?
13. **Vidljivost ocjena:** odmah nakon ocjenjivanja ili tek nakon "objave" svih ocjena zadatka?
14. **Datoteke:** veličina i tipovi. *Preporuka: 20 MB; pdf, zip, txt i izvorni kod.*
15. **Čuvanje podataka:** koliko dugo nakon akademske godine, i tko je voditelj obrade?
16. **Kolegiji i nastavnici:** kreira ih samo admin ili postoji samoposluživanje?

---

## 15. Verifikacija (po fazi)
1. `docker compose -f docker-compose.dev.yml up -d && npm run db:migrate && npm run seed`.
2. `npm run test:db`: posebno `meta` i `izolacija-studenta`.
3. `npm test` i `npx playwright test`.
4. Ručni demo:
   - kao nastavnik: uvoz CSV-a s greškama → pregled → potvrda → preuzimanje lozinki;
   - u privatnom prozoru kao novi student: prijava → prisilna promjena lozinke → dashboard;
   - pokušaj otvaranja URL-a s ID-em tuđe predaje ili datoteke mora vratiti 404.
5. Na testnom serveru: `docker compose up -d`, provjera HTTPS-a i healthchecka, backup pa povrat u prazan kontejner i usporedba broja redova.
