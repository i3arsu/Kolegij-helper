# Praćenje studenata

Web aplikacija za praćenje dolaznosti, bodova i zadataka na sveučilišnom kolegiju.
Nastavnik i asistenti vode evidenciju, a student vidi samo vlastite podatke.

Stack: Next.js 16 (App Router) · PostgreSQL 17 s Row Level Security · Kysely · Docker.
Detaljan plan i faze su u `PLAN.md`.
Na engleskom: [docs/BRIEF.md](docs/BRIEF.md) (opis aplikacije) i [docs/PHASE-2-PLAN.md](docs/PHASE-2-PLAN.md) (plan za Fazu 2).

## Sigurnosni model ukratko

- **Izolacija je u bazi.** Aplikacija se spaja kao `app_user` (nije vlasnik tablica, nema `BYPASSRLS`)
  i svaki upit izvršava u transakciji s `set_config('app.korisnik_id', …, true)`
  (`lib/db/klijent.ts → kaoKorisnik`, odnosno `upit()` iz `lib/auth/guard.ts`).
  RLS politike (`db/migrations/0006_rls_politike.sql`) određuju što tko vidi.
  Bez postavljenog konteksta svi upiti vraćaju 0 redova.
- `app_user` nema pravo čitanja `korisnik.lozinka_hash`, sesija ni pokušaja prijave.
  Prijavu i sesije obrađuje zasebna uloga `app_auth` (`lib/auth/`).
- Studenti, upisi i članstva u grupama mijenjaju se isključivo kroz `security definer` funkcije
  koje same provjeravaju ovlasti (`0008_funkcije_studenata.sql`).
- Lozinke: argon2id. Generirane lozinke prikazuju se samo jednom i nigdje se ne spremaju.
  Pri prvoj prijavi student mora postaviti vlastitu lozinku.
  Nakon 5 neuspjelih pokušaja u 15 minuta račun se zaključava na 15 minuta.
- ESLint zabranjuje uvoz sirovih DB klijenata izvan `lib/db` i `lib/auth`.

## Lokalni razvoj

Potrebno: Node 22, Git i Docker Desktop (na Windowsu s WSL2 backendom). Docker Desktop mora biti pokrenut.

```bash
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
npm install
npm run db:up                 # Postgres na 127.0.0.1:DB_PORT (zadano 5433)
npm run db:migrate
npm run seed                  # Programiranje 2, 25 izmišljenih studenata, termini, dolaznost
npm run dev
```

`.env` uređujte u editoru. U `.env.example` zamijenite svaku vrijednost `promijeni`, a za lozinke koristite samo znakove `A-Z a-z 0-9 - _`. Ne dodajite retke s `echo … >> .env` u PowerShellu, jer on piše UTF-16 i pokvari datoteku.

### Windows: česti problemi

- **Prijelomi redaka (CRLF).** `.gitattributes` osigurava da `*.sh` i `*.sql` ostanu s LF prijelomima. Ako je repo kloniran prije toga, ili je baza prvi put pokrenuta s pokvarenom init skriptom:
  ```powershell
  git rm -r --cached . -q; git reset --hard   # ponovno izvlači datoteke s ispravnim prijelomima
  npm run db:down -- -v                       # briše dev bazu; init skripta se izvršava samo na praznom volumenu
  npm run db:up
  ```
- **Port je zauzet ili zabranjen** (`bind: An attempt was made to access a socket in a way forbidden…`). Windows (Hyper-V) rezervira dijelove raspona 49152–65535. Postavite drugi `DB_PORT` u `.env` (npr. 5433 ili 5434) i isti port upišite u sva tri `*_DATABASE_URL`. Zauzete raspone možete provjeriti s `netsh int ipv4 show excludedportrange protocol=tcp`.
- **`db:up` ne prolazi.** Pogledajte zapis baze:
  ```bash
  docker compose -f docker-compose.dev.yml logs db
  ```
  Greška u `00-uloge.sh` znači problem s prijelomima redaka (vidi prvu točku).

Seed računi (lozinka je `SEED_LOZINKA` iz `.env`):

| e-mail | uloga |
|---|---|
| `admin@unipu.test` | admin (kreira kolegije) |
| `marko.peric@unipu.test` | nastavnik |
| `ivana.juric@unipu.test` | asistentica (V2, V3) |
| `tomislav.kos@unipu.test` | asistent (V1) |
| `ivan.horvat@student.unipu.test` i dr. | studenti; `lucija.novak@…` mora promijeniti lozinku |

Ogledne CSV datoteke za uvoz nalaze se u `db/podaci/` (ispravna, s greškama, ponovni uvoz).

Nakon promjene sheme pokrenite `npm run db:migrate`, a zatim `npm run db:types`
(time se regenerira `lib/db/tipovi.ts`).

## Testovi

```bash
npm test          # unit: CSV, lozinke, vremenske zone/DST, izračun dolaznosti
npm run test:db   # RLS i poslovna pravila na pravom Postgresu (Testcontainers)
npm run lint && npm run typecheck
```

DB testovi (`tests/db/`):
- `meta`: sve tablice imaju RLS, `app_user` nema `BYPASSRLS`, view-ovi su `security_invoker`, …
- `izolacija-studenta`: student ne može pročitati ni promijeniti tuđe podatke
- `osoblje-opseg`: asistent vidi samo svoje grupe, nastavnik samo svoje kolegije
- `uvoz`: ponovni uvoz ne briše, promjena grupe, konflikti e-maila
- `dolaznost`: izračun postotka (opravdano, otkazani termini, gosti, promjena grupe)

## Produkcija (vlastiti poslužitelj)

```bash
cp .env.example .env    # postaviti jake lozinke (samo [A-Za-z0-9_-]), QR_TAJNA, APP_URL=https://…, DOMENA
docker compose up -d --build
docker compose run --rm migracije npx tsx scripts/kreiraj-admina.ts ime.prezime@unipu.hr Ime Prezime
```

- `db`: Postgres bez objavljenog porta. `migracije`: dbmate, pokreće se pri svakom `up`.
  `app`: Next.js. `proxy`: Caddy s automatskim TLS-om.
- Ako sveučilište ima vlastiti reverse proxy, ukloniti servis `proxy` i usmjeriti postojeći proxy na `app:3000`.
  Proxy mora postavljati `X-Forwarded-For`.
- **Backup:** `scripts/backup.sh` pokretati iz crona (dnevni `pg_dump` i arhiva predanih datoteka, s rotacijom).
  Odredište treba sinkronizirati na drugu lokaciju.
- **Povrat:**
  ```bash
  docker compose exec -T db pg_restore -U postgres -d pracenje --clean --if-exists < backups/dnevni/baza-YYYY-MM-DD.dump
  ```
  Povrat treba testirati prije produkcije i jednom po semestru.

## Struktura

```
app/            rute (nastava/ = osoblje, moj/ = student), Server Actions u akcije.ts
components/     privremene UI komponente (zamjenjuju se prema Claude Design materijalima)
lib/auth        lozinke, sesije, prijava, guardovi
lib/db          Kysely klijent, RLS kontekst, generirani tipovi
lib/servisi     poslovna logika (sve kroz RLS transakciju)
lib/csv         parsiranje, validacija i usporedba CSV uvoza
lib/domena      vrijeme (Europe/Zagreb), termini, dolaznost
db/migrations   SQL migracije (dbmate): shema, RLS, funkcije, view-ovi
db/init         kreiranje uloga pri prvom startu Postgresa
scripts         seed, kreiraj-admina, backup
tests           unit i DB testovi
docker          Dockerfile, Caddyfile
```
