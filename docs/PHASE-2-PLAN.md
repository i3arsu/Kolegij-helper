# Phase 2 Implementation Plan: Assignments, Submissions, Feedback

Audience: the developer implementing Phase 2. Read [BRIEF.md](BRIEF.md) first. It explains the app, the roles and the Croatian vocabulary used in code.

## 0. Goal

At the end of Phase 2:

- **Lecturer:** creates an assignment (title, description, attachments, deadline, max points, allowed submission types, whole course or selected groups) and publishes it.
- **Student:** sees the assignment and submits a file, a link and/or text.
- **Lecturer or assistant:** reviews the submission, writes feedback (optionally from a template), and either **accepts** it with points or **returns it for revision**, optionally with a revision deadline.
- **Revision rounds:** the student resubmits (version 2, 3, …) until the work is accepted.
- **Late submissions:** a submission after the deadline is flagged **late**. The lecturer can extend the deadline for an individual student.
- **Isolation:** a student can never see another student's submissions, files, points or feedback. Automated tests prove this.

Out of scope for Phase 2 (do **not** build these):
- email notifications;
- warnings and analytics;
- CSV export of points;
- the total-points-vs-threshold dashboard (that is Phase 3);
- team assignments;
- styling beyond the existing placeholder components.

## 1. Decisions (defaults until confirmed)

Some product questions are still open. Build with these defaults and keep them easy to change. Each one should live in one place (one SQL function or one constant).

| # | Question | Default for now |
|---|---|---|
| D1 | Individual or team submissions? | **Individual only** |
| D2 | Where do points come from? | Only from assignments. Phase 2 stores points per assignment; totals come in Phase 3. |
| D3 | What happens to late work? | **Flag only**, no automatic penalty. Each assignment has a setting `dopusti_kasnu_predaju` (allow late submission). If it is off, submitting after the deadline is rejected. |
| D4 | What may a teaching assistant do? | Review and grade students in **their own groups**. Only the lecturer may create, edit, publish or delete assignments, grant extensions, and reopen an accepted submission. |
| D5 | When does the student see points? | Immediately after grading. |
| D6 | File limits | Max **20 MB** per file and **5 files** per version. Allowed: pdf, zip, txt, md, c, h, cpp, hpp, py, java, js, ts, png, jpg. |

If any default changes, your mentor will tell you which function or constant to adjust.

## 2. Before you start

### Setup

```bash
cp .env.example .env              # Windows PowerShell: Copy-Item .env.example .env
# Edit .env in your editor:
#   - replace every "promijeni" (use [A-Za-z0-9_-] only)
#   - add the line DATOTEKE_DIR=./.data/datoteke
# Do NOT use `echo ... >> .env` in PowerShell (it writes UTF-16 and breaks the file).
npm install
npm run db:up && npm run db:migrate && npm run seed
npm run dev                       # http://localhost:3000, log in with the seed accounts in README.md
npm test && npm run test:db       # both must be green before you change anything
```

You need Docker Desktop running, because the database and `test:db` use Docker. On Windows, see the section "Windows: česti problemi" in `README.md` (line endings, reserved ports).

### Read first (about 2 hours, worth it)

1. **`lib/auth/guard.ts`** shows how every page and action gets the current user and runs queries through `upit()`.
2. **`db/migrations/0005`–`0008`**: RLS helper functions, policies, and `security definer` functions. `0008` (`uvezi_studente`) is the pattern your submission and grading functions will follow.
3. **`lib/servisi/termini.ts`** and **`app/nastava/[kolegijId]/termini/`**:
   - a complete feature: service, Server Actions in `akcije.ts`, client form with `useActionState`, server page.
   - Copy this structure.
4. **`tests/db/izolacija-studenta.test.ts`** and **`tests/db/pomocnici.ts`** show how to test as a specific user.
5. **`AGENTS.md`**: Next.js 16 differs from older versions you may know. When unsure, read the docs in `node_modules/next/dist/docs/`.

### Rules of this codebase (non-negotiable)

1. **All database access goes through `upit()`** (or `kaoKorisnik()` in tests and scripts).
   - Never import `bazaApp` or `bazaAuth` in app code. ESLint will fail if you do.
   - Code that runs without the user context bypasses the whole security model.
2. **Never trust IDs from the client.**
   - Validate the format with `z.uuid()`.
   - Let RLS and the database functions decide whether the user may touch the row.
   - If a query returns nothing, respond with `notFound()` or 404. Never 403, because that reveals the row exists.
3. **Migrations that are already applied are immutable.** Always add a new file (`0010_…`, `0011_…`). After any schema change, run `npm run db:migrate && npm run db:types` and commit the regenerated `lib/db/tipovi.ts`.
4. **Business rules that protect data live in the database**, as `security definer` functions and triggers. TypeScript only validates input and shows nice errors. Every `security definer` function must:
   - have `set search_path = ''` and fully qualify names (`public.predaja`, `private.je_nastavnik(...)`);
   - check permissions in its first lines;
   - raise errors with `errcode = 'P0001'` and a Croatian message for business errors, or `'42501'` for "no permission". `lib/http/greske.ts` turns these into UI messages.
5. **"Now" comes from the database (`now()`)**, never from `Date.now()` in components or actions. Deadlines are compared in SQL.
6. **Time zones.** Store `timestamptz`. Form inputs are local Zagreb time; convert them with `lokalnoUTrenutak(datum, vrijeme)` from `lib/domena/vrijeme.ts`. A deadline entered as a date only means `23:59` that day.
7. **`numeric` columns** (points) come back from Postgres as **strings**. Convert them with `Number()` only at the UI edge.
8. **Language.** All user-facing text is in Croatian. Use Croatian identifiers, matching the existing code. Code comments may be in Croatian or English, but keep them short.
9. **Design.** Do not style. Use `components/ui.tsx`. The design system will replace it later.
10. **Logging.** Never log file contents, passwords or full request bodies.

### Workflow

- One branch and one pull request per milestone (M1 … M7 below).
- Before opening a PR, run `npm run lint && npm run typecheck && npm test && npm run test:db`. All must pass.
- In the PR description:
  - what you did;
  - how you tested it (including manual steps);
  - anything you were unsure about.
- Small, reviewable PRs are better than one huge one.
- If something in this plan seems wrong or unclear, ask before building around it.

## 3. Data model

Migrations in order:

| File | Contents |
|---|---|
| `0010_zadaci.sql` | Files, assignments, group assignment, attachments, deadline extensions, comment templates, plus RLS |
| `0011_predaje.sql` | Submissions, versions, feedback, status enum, triggers, plus RLS |
| `0012_funkcije_predaja.sql` | Helper and action functions |
| `0013_view_predaja.sql` | Views with computed status and the late flag |

### 3.1 `0010_zadaci.sql`

```sql
-- migrate:up
create table datoteka (                      -- metadata only; content lives on disk (DATOTEKE_DIR)
  id         uuid primary key default gen_random_uuid(),
  putanja    text not null unique,           -- relative to DATOTEKE_DIR, generated by the server, never from user input
  naziv      text not null,                  -- original file name, for display/download only
  velicina   bigint not null check (velicina > 0 and velicina <= 20 * 1024 * 1024),
  mime       text not null,
  sha256     text not null,
  vlasnik    uuid not null references korisnik default private.trenutni_korisnik(),
  created_at timestamptz not null default now()
);

create table zadatak (
  id                    uuid primary key default gen_random_uuid(),
  kolegij_id            uuid not null references kolegij on delete cascade,
  naslov                text not null check (length(trim(naslov)) > 0),
  opis                  text not null default '',
  rok                   timestamptz not null,
  max_bodova            numeric(6,2) not null check (max_bodova > 0),
  nacini_predaje        text[] not null default '{datoteka}'
                        check (nacini_predaje <@ array['datoteka','link','tekst'] and cardinality(nacini_predaje) > 0),
  dopusti_kasnu_predaju boolean not null default true,
  za_cijeli_kolegij     boolean not null default true,
  objavljen_at          timestamptz,           -- null = draft, invisible to students
  created_by            uuid not null references korisnik default private.trenutni_korisnik(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on zadatak (kolegij_id, rok);
create trigger zadatak_updated_at before update on zadatak
  for each row execute function private.postavi_updated_at();

create table zadatak_grupa (                 -- used only when za_cijeli_kolegij = false
  zadatak_id uuid references zadatak on delete cascade,
  grupa_id   uuid references grupa on delete cascade,
  primary key (zadatak_id, grupa_id)
);
create index on zadatak_grupa (grupa_id);

create table zadatak_prilog (
  zadatak_id  uuid references zadatak on delete cascade,
  datoteka_id uuid references datoteka on delete cascade,
  primary key (zadatak_id, datoteka_id)
);

create table produzenje_roka (
  zadatak_id uuid references zadatak on delete cascade,
  student_id uuid references student on delete cascade,
  novi_rok   timestamptz not null,
  razlog     text,
  odobrio    uuid references korisnik default private.trenutni_korisnik(),
  created_at timestamptz not null default now(),
  primary key (zadatak_id, student_id)
);

create table predlozak_komentara (
  id         uuid primary key default gen_random_uuid(),
  kolegij_id uuid not null references kolegij on delete cascade,
  naslov     text not null,
  tekst      text not null
);
create index on predlozak_komentara (kolegij_id);
```

Also in `0010`:

- **Helper `private.zadatak_dodijeljen(p_zadatak uuid, p_student uuid) returns boolean`**
  (`security definer`, `stable`, `search_path = ''`).
  - Returns true if the assignment is **published**, the student has an **active** enrollment in its course, and one of these holds:
    - `za_cijeli_kolegij` is true; or
    - the student is **currently** (`upper_inf(cg.vrijedi)`) a member of one of the assignment's groups.
  - It **also** returns true if the student already has a `predaja` row for that assignment. This keeps work visible after a group change.
- **RLS:** enable it on every new table. Policies:

| Table | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `zadatak` | `je_osoblje(kolegij_id) or private.zadatak_dodijeljen(id, private.moj_student_id())` | insert/update: `je_nastavnik(kolegij_id)`; delete: `je_nastavnik(kolegij_id) and objavljen_at is null` |
| `zadatak_grupa` | `exists (select 1 from zadatak z where z.id = zadatak_id and private.je_osoblje(z.kolegij_id))` | the same with `je_nastavnik` |
| `zadatak_prilog` | `exists (select 1 from zadatak z where z.id = zadatak_id)`, so it inherits `zadatak` visibility | `je_nastavnik` of the assignment's course |
| `datoteka` | `private.vidi_datoteku(id)` (defined in 0012; create the policy there) | insert: `vlasnik = trenutni_korisnik() and private.moj_osoblje_id() is not null` (staff upload attachments directly; students go through `predaj_zadatak`); delete: `vlasnik = trenutni_korisnik()` |
| `produzenje_roka` | `student_id = moj_student_id()` or `je_osoblje` of the course | `je_nastavnik` of the course |
| `predlozak_komentara` | `je_osoblje(kolegij_id)` | `je_nastavnik(kolegij_id)` |

- **Trigger on `zadatak` (before update):** refuse to unpublish (`objavljen_at` going from a value to `null`) when any `predaja` exists. Add it in `0011`, once `predaja` exists.

### 3.2 `0011_predaje.sql`

```sql
-- migrate:up
create type status_predaje as enum ('nije_predano','predano','u_pregledu','vraceno_na_doradu','prihvaceno');

create table predaja (                       -- one row per (assignment, student), created on first submit
  id               uuid primary key default gen_random_uuid(),
  zadatak_id       uuid not null references zadatak on delete restrict,
  student_id       uuid not null references student on delete cascade,
  status           status_predaje not null default 'nije_predano',
  trenutna_verzija int not null default 0,
  bodovi           numeric(6,2) check (bodovi >= 0),   -- latest non-null points from feedback
  pregledava       uuid references korisnik,            -- who has "claimed" it for review
  updated_at       timestamptz not null default now(),
  unique (zadatak_id, student_id)
);
create index on predaja (student_id);
create index on predaja (zadatak_id, status);

create table predaja_verzija (
  id         uuid primary key default gen_random_uuid(),
  predaja_id uuid not null references predaja on delete cascade,
  broj       int not null check (broj >= 1),
  tekst      text check (length(tekst) <= 20000),
  link       text check (link ~* '^https?://' and length(link) <= 2000),
  predano_at timestamptz not null default now(),
  unique (predaja_id, broj)
);

create table predaja_datoteka (
  verzija_id  uuid references predaja_verzija on delete cascade,
  datoteka_id uuid references datoteka on delete restrict,
  primary key (verzija_id, datoteka_id)
);

create table povratna_informacija (          -- exactly one per reviewed version
  id           uuid primary key default gen_random_uuid(),
  predaja_id   uuid not null references predaja on delete cascade,
  verzija_broj int not null,
  autor_id     uuid not null references korisnik default private.trenutni_korisnik(),
  komentar     text not null check (length(trim(komentar)) > 0),
  bodovi       numeric(6,2) check (bodovi >= 0),
  odluka       text not null check (odluka in ('vraceno_na_doradu','prihvaceno')),
  rok_dorade   timestamptz,                  -- deadline for the next version (null = none)
  created_at   timestamptz not null default now(),
  unique (predaja_id, verzija_broj)
);
create index on povratna_informacija (predaja_id);
```

Also in `0011`:

- **Status state machine trigger** `private.predaja_prijelaz()`, `before update of status on predaja`. It allows **only** these pairs and raises `'Nedopušten prijelaz statusa: % → %'` (P0001) for anything else:

| From | To | Done by (enforced in the 0012 functions) |
|---|---|---|
| `nije_predano` | `predano` | student, first submission |
| `predano` | `predano` | student replaces the content of the same version, before review starts |
| `predano` | `u_pregledu` | staff claims it |
| `u_pregledu` | `predano` | staff releases the claim |
| `predano`, `u_pregledu` | `vraceno_na_doradu` | staff returns it (comment required) |
| `predano`, `u_pregledu` | `prihvaceno` | staff accepts it (comment and points required) |
| `vraceno_na_doradu` | `predano` | student resubmits; version + 1 |
| `prihvaceno` | `u_pregledu` | **lecturer only**, reopen |

- **Points guard (trigger):** on `povratna_informacija` insert/update, raise if `bodovi > zadatak.max_bodova`. On `zadatak` update, raise if the new `max_bodova` is lower than any existing `predaja.bodovi`.
- **Unpublish guard** on `zadatak` (see 3.1).
- **Audit:** attach `private.zapisi_reviziju('id')` (it already exists) to `povratna_informacija` and to `predaja` (`after update of status`).
- **RLS:** enable on all four tables. **SELECT policies only**; nobody writes these tables directly.

```sql
-- same pattern for predaja_verzija / predaja_datoteka / povratna_informacija (join up to predaja)
create policy predaja_cita on predaja for select to app_user using (
  student_id = (select private.moj_student_id())
  or exists (select 1 from zadatak z where z.id = zadatak_id and private.vidi_studenta(z.kolegij_id, student_id))
);
```

### 3.3 `0012_funkcije_predaja.sql`

Helpers (`security definer`, `stable`, `search_path = ''`):

- **`private.smije_ocjenjivati(p_predaja uuid) returns boolean`**: true when the caller is staff on the course (`je_osoblje`) **and** `vidi_studenta(kolegij, student)`. A lecturer sees everyone; an assistant sees only their groups (D4).
- **`private.vidi_datoteku(p_datoteka uuid) returns boolean`**: true if any of these holds:
  - the caller owns the file;
  - it is an attachment of an assignment visible to the caller (staff of the course, or `zadatak_dodijeljen` for the student);
  - it belongs to a submission version the caller may see (own submission, or `vidi_studenta`).

  Create the `datoteka` SELECT policy here.

Action functions (`security definer`, volatile). The app calls them with `select private.xxx(...)` inside `upit()`.

**`private.predaj_zadatak(p_zadatak uuid, p_tekst text, p_link text, p_datoteke jsonb) returns jsonb`**

- `p_datoteke`: `[{putanja, naziv, velicina, mime, sha256}]`, describing files the route handler has already written to disk.
- Returns `{ predaja_id, verzija, uklonjene_putanje: [...] }`. The handler deletes `uklonjene_putanje` from disk.

Steps, in this order:

1. **Caller and assignment checks.**
   - The caller must be a student (`moj_student_id()` not null).
   - `zadatak_dodijeljen(p_zadatak, me)` must be true; otherwise `42501`.
2. **Content checks.** At least one of text, link or files must be present. Each present kind must be in `nacini_predaje`. At most 5 files. Otherwise P0001 with a clear Croatian message.
3. **Lock.** Lock or create the `predaja` row (`insert … on conflict do nothing`, then `select … for update`).
4. **Decide by current status:**
   - `nije_predano` → new version 1, status `predano`.
   - `vraceno_na_doradu` → new version `trenutna_verzija + 1`, status `predano`.
   - `predano` → **replace** the current version:
     - delete its `predaja_datoteka` and the now-unused `datoteka` rows, and collect their `putanja`;
     - update `tekst`, `link` and `predano_at = now()`.
   - `u_pregledu` or `prihvaceno` → P0001 `'Predaja je u pregledu ili prihvaćena i ne može se mijenjati.'`
5. **Deadline check.** The version's deadline is:
   - for version 1: `coalesce(produzenje.novi_rok, zadatak.rok)`;
   - for version N > 1: `rok_dorade` of the feedback on version N−1 (null = no deadline).

   If `now()` is after the deadline **and** `dopusti_kasnu_predaju` is false → P0001 `'Rok za predaju je istekao.'`
6. **Write.** Insert the `datoteka` rows (`vlasnik` = caller) and the `predaja_datoteka` links.
7. **Return** the result.

**`private.preuzmi_pregled(p_predaja uuid)`**
- Requires `smije_ocjenjivati`.
- `predano` → `u_pregledu`, with `pregledava = trenutni_korisnik()`.

**`private.otpusti_pregled(p_predaja uuid)`**
- Requires `smije_ocjenjivati`.
- `u_pregledu` → `predano`, with `pregledava = null`.

**`private.ocijeni(p_predaja uuid, p_odluka text, p_komentar text, p_bodovi numeric, p_rok_dorade timestamptz)`**
- Requires `smije_ocjenjivati`.
- The status must be `predano` or `u_pregledu`.
- `prihvaceno` requires points; `vraceno_na_doradu` may have points (shown to the student as "provisional").
- Inserts `povratna_informacija` for `trenutna_verzija`. If `p_bodovi` is not null, sets `predaja.bodovi`. Sets the status and `pregledava = null`.

**`private.ponovno_otvori(p_predaja uuid)`**
- Lecturer only (`je_nastavnik`).
- `prihvaceno` → `u_pregledu`.
- Keep the old feedback. A new decision on the **same** version **updates** that feedback row instead of inserting a second one (the unique key does not allow two).

`revoke execute … from public` on any helper the app should not call directly (see `postavi_grupu` in `0008`).

### 3.4 `0013_view_predaja.sql`

Both views use `with (security_invoker = true)` so RLS applies. The `meta` test enforces this.

```sql
create view v_predaja_verzija with (security_invoker = true) as
select v.id as verzija_id, v.predaja_id, p.zadatak_id, p.student_id, v.broj, v.predano_at, r.rok_verzije,
       coalesce(v.predano_at > r.rok_verzije, false) as kasni
from predaja_verzija v
join predaja p on p.id = v.predaja_id
join zadatak z on z.id = p.zadatak_id
left join produzenje_roka pr on pr.zadatak_id = p.zadatak_id and pr.student_id = p.student_id
cross join lateral (
  select case when v.broj = 1 then coalesce(pr.novi_rok, z.rok)
              else (select pi.rok_dorade from povratna_informacija pi
                    where pi.predaja_id = p.id and pi.verzija_broj = v.broj - 1)
         end as rok_verzije
) r;

-- One row per (assigned student × published assignment), even if nothing has been submitted yet.
create view v_predaja with (security_invoker = true) as
with dodijeljeni as (
  select z.kolegij_id, z.id as zadatak_id, u.student_id
  from zadatak z
  join upis u on u.kolegij_id = z.kolegij_id and u.status = 'aktivan'
  where z.objavljen_at is not null
    and (z.za_cijeli_kolegij or exists (
          select 1 from zadatak_grupa zg
          join clanstvo_grupe cg on cg.grupa_id = zg.grupa_id and cg.upis_id = u.id and upper_inf(cg.vrijedi)
          where zg.zadatak_id = z.id))
  union
  select z.kolegij_id, p.zadatak_id, p.student_id from predaja p join zadatak z on z.id = p.zadatak_id
)
select d.kolegij_id, d.zadatak_id, d.student_id, p.id as predaja_id,
       coalesce(p.status, 'nije_predano') as status,
       coalesce(p.trenutna_verzija, 0) as trenutna_verzija,
       p.bodovi, p.pregledava,
       zv.predano_at, coalesce(zv.kasni, false) as kasni,
       coalesce(pr.novi_rok, z.rok) as rok,
       now() > coalesce(pr.novi_rok, z.rok) as rok_prosao
from dodijeljeni d
join zadatak z on z.id = d.zadatak_id
left join predaja p on p.zadatak_id = d.zadatak_id and p.student_id = d.student_id
left join produzenje_roka pr on pr.zadatak_id = d.zadatak_id and pr.student_id = d.student_id
left join v_predaja_verzija zv on zv.predaja_id = p.id and zv.broj = p.trenutna_verzija;
```

The late flag is **computed, not stored**. If the lecturer moves a deadline or grants an extension, the flag corrects itself.

## 4. File storage

Files go to the directory in env `DATOTEKE_DIR`:
- production: `/data/datoteke`, already mounted as a Docker volume in `docker-compose.yml`;
- development: `./.data/datoteke` (add `.data/` to `.gitignore`).

Create these modules:

**`lib/datoteke/spremiste.ts`**
- `spremi(bajtovi, { kolegijId, zadatakId, vlasnik })` writes to `{kolegij}/{zadatak}/{vlasnik}/{random uuid}` and returns `{ putanja, velicina, sha256 }`. The user's file name is **never** part of the path.
- `otvori(putanja)` returns a read stream.
- `obrisi(putanja)` deletes the file.
- Resolve every path and assert it stays inside `DATOTEKE_DIR` (defence against path traversal).

**`lib/datoteke/provjera.ts`**
- Validates each file: size (≤ 20 MB, > 0) and type (D6).
  - Binary types: detect the real type from content with the `file-type` package (`npm i file-type`), not from the extension. A `.exe` renamed to `.pdf` must be rejected.
  - Text types (txt, md, source code): `file-type` cannot detect them. Accept them by extension **and** only if the content is valid UTF-8 without NUL bytes.
- Returns a Croatian error message or the normalised `mime`.

**Upload: `POST /api/predaje/[zadatakId]/route.ts`**
1. Check the `Origin` header equals the app origin, otherwise 403. See `app/odjava/route.ts`.
2. Require a session (`zahtijevajProfil`). Validate `zadatakId` with `z.uuid()`.
3. Reject a `Content-Length` above 5 × 20 MB plus overhead with 413. Then read `await request.formData()`. Fields: `tekst`, `link`, `datoteke` (multiple).
4. Validate every file **before** writing anything. Write the files with `spremi`.
5. Call `private.predaj_zadatak` inside `upit()`.
   - On success, delete `uklonjene_putanje` from disk.
   - On **any** error, delete the files you just wrote, then return `{ greska: porukaGreske(e) }`.
6. Respond with JSON. The client form uses `fetch` and `FormData`. Server Actions are not used here because of their 1 MB body limit.

**Teacher attachments: `POST /api/zadaci/[zadatakId]/prilozi/route.ts`**
- Same pattern. Insert into `datoteka` and `zadatak_prilog` directly; RLS allows only the course lecturer.

**Download: `GET /api/datoteke/[id]/route.ts`**
- Select the `datoteka` row inside `upit()`. If there is no row, return **404**. That covers both "does not exist" and "not yours".
- Otherwise stream the file with these headers:
  - `Content-Disposition: attachment; filename*=UTF-8''<encoded name>`
  - `X-Content-Type-Options: nosniff`
  - `Cache-Control: private, no-store`

Important:
- **Do not** add `/api/predaje` or `/api/zadaci` to the `matcher` in `proxy.ts`. The proxy buffers request bodies and caps them at 10 MB. `/api/datoteke` is already in the matcher and is fine, because it only serves GET.
- Caddy (production) already caps request bodies at 25 MB.

## 5. Pages and features

Follow the existing structure: service functions in `lib/servisi/`, Server Actions in `akcije.ts` next to the page, client forms with `useActionState`, and pages that load data via `upit()`.

### Lecturer and assistant (`app/nastava/[kolegijId]/…`)

| Route | What it does |
|---|---|
| (layout) | Add a **Zadaci** tab to the course navigation. |
| `zadaci/page.tsx` | List of assignments: title, deadline, groups, draft/published, and counts per status (not submitted / submitted / in review / returned / accepted). Lecturer sees a "New assignment" button. |
| `zadaci/novi/page.tsx` | Lecturer only. Form: title, description, deadline (date + time, default 23:59), max points, allowed submission types (checkboxes), allow late (checkbox), whole course or groups (multi-select). Saves as **draft**. |
| `zadaci/[zadatakId]/page.tsx` | Details. **Lecturer:** edit form, Publish button, attachments (upload/remove), extensions (add/remove per student, with a reason). **Everyone:** a submissions table from `v_predaja`, filterable by status and group, with a late badge, points and a link to each submission. |
| `zadaci/[zadatakId]/predaje/[predajaId]/page.tsx` | Review screen: student name and JMBAG; all versions newest first (text, link, file downloads, late badge, feedback per version); Claim / Release buttons; feedback form (template dropdown that inserts text into the comment, points, optional revision deadline, buttons **Prihvati** and **Vrati na doradu**); lecturer-only **Ponovno otvori**. Link "Sljedeća predaja" to the next submission waiting for review. |
| `postavke/page.tsx` | New card **Predlošci komentara**: list, add, edit and delete templates. |
| `page.tsx` (summary) | New card: "Čeka pregled: N". |
| `studenti/[studentId]/page.tsx` | New card: this student's assignments and their status. |

### Student (`app/moj/[kolegijId]/…`)

| Route | What it does |
|---|---|
| (layout) | Add a **Zadaci** tab. |
| `zadaci/page.tsx` | Assigned, published assignments: deadline (the effective one, including an extension), status badge, late badge, points. |
| `zadaci/[zadatakId]/page.tsx` | Description, attachments, effective deadline. Submission form showing only the allowed types; disabled with an explanation when the status does not allow submitting. Version history with feedback under each version. |
| `page.tsx` (dashboard) | Cards "Sljedeći rokovi" (next 5 deadlines) and "Zadnje povratne informacije". |

Status labels in Croatian (put them in `lib/domena/statusi.ts`):

| Status | Label |
|---|---|
| `nije_predano` | Nije predano |
| `predano` | Predano |
| `u_pregledu` | U pregledu |
| `vraceno_na_doradu` | Vraćeno na doradu |
| `prihvaceno` | Prihvaćeno |
| late flag | Kasni |

## 6. Tests (required, part of each milestone)

### Database tests (`tests/db/`)

Use `novoOkruzenje()` and `postaviScenu()`. Add a new helper `tests/db/scena-zadaci.ts` that adds:
- a whole-course assignment;
- a V1-only assignment;
- a draft;
- one submission by S1.

Do not change the existing scene; other tests depend on it.

**`zadaci.test.ts`**
- Drafts are invisible to students.
- A V1-only assignment is invisible to an S2 who is in V2.
- After a group change, a student keeps seeing an assignment they already submitted to.
- Only drafts can be deleted.
- Unpublishing is refused once submissions exist.
- Lowering `max_bodova` below already-given points is refused.
- An assistant cannot create or edit assignments.

**`predaje.test.ts`**
- **Every** allowed transition works through the functions.
- A table-driven test covers **every** disallowed pair; each one is rejected.
- Direct `UPDATE predaja` as a student affects 0 rows. As the owner, a disallowed status change raises an error (the trigger works).
- Deadlines:
  - late submissions are flagged;
  - they are refused when late submission is disabled;
  - an extension makes them on time;
  - moving the deadline later clears the flag;
  - the revision deadline applies to version 2.
- Replacing a `predano` version returns the old file paths.
- `u_pregledu` and `prihvaceno` cannot be changed by the student.
- Grading:
  - the assistant of V1 can grade S1 but not S2;
  - only the lecturer can reopen;
  - points above max are refused;
  - accepting without points is refused.

**Extend `izolacija-studenta.test.ts`**
- As S1, every new table and view returns only S1's rows: `predaja`, `predaja_verzija`, `predaja_datoteka`, `povratna_informacija`, `datoteka`, `produzenje_roka`, `v_predaja`, `v_predaja_verzija`.
- `ocijeni`, `preuzmi_pregled`, `ponovno_otvori` and `predaj_zadatak` (for S2's or an unassigned assignment) are refused.
- The no-context test covers the new tables.

`meta.test.ts` automatically checks the new tables and views. If it fails, fix the migration, not the test.

### Unit tests (`tests/unit/`)

- File validation: a real PDF passes; an EXE renamed to `.pdf` fails; a `.c` file containing NUL bytes fails; 0 bytes and 21 MB fail.
- The path builder never contains user input and never escapes `DATOTEKE_DIR`.
- The download header encodes names with Croatian characters and spaces correctly.

### End-to-end (milestone M7)

Set up Playwright (`npm i -D @playwright/test`, `npx playwright install chromium`). Seed before the run.

1. **Happy path:**
   - the student uploads a PDF;
   - the assistant returns it with a comment;
   - the student submits version 2;
   - the lecturer accepts it with points;
   - the student sees the points and the feedback.
2. **IDOR:** logged in as student B, request:
   - A's file URL (`/api/datoteke/<id>`): expect 404;
   - A's submission page under `/nastava/...`: expect 404 or redirect;
   - `POST /api/predaje/<assignment not assigned to B>`: expect an error, and verify nothing changed in the database.

## 7. Milestones

| # | Pull request | Size | Done when |
|---|---|---|---|
| **M0** | Setup and reading (no PR) | S | App runs locally; both test suites are green; you can explain what `upit()` and `security_invoker` do. |
| **M1** | `0010` migration + RLS + `zadaci.test.ts` | M | All zadaci tests pass; `meta` passes; `npm run db:types` committed. |
| **M2** | `0011`–`0013` + `predaje.test.ts` + extended isolation tests | L | All transition, deadline and isolation tests pass. **Mentor reviews the SQL before you continue.** |
| **M3** | File storage modules, upload/download routes, unit tests | M | Manual check: upload a PDF via curl or a form, download it as the owner, get 404 as another student. |
| **M4** | Lecturer pages: assignment list, create/edit/publish, attachments, extensions, templates in settings | M | A lecturer can create and publish an assignment with an attachment for V1 only, and students in V2 don't see it. |
| **M5** | Student pages: list, detail, submission form, history; dashboard cards | M | A student submits a file + text, sees "Predano", and can replace it until review starts. |
| **M6** | Review screen, claim/release, grading with templates, revision rounds, reopen | M | The full cycle works in the browser: submit → return → v2 → accept. The assistant can only grade their own groups. |
| **M7** | Seed data (Z1–Z4 from `PLAN.md` §12 with small fake files), Playwright setup + E2E tests, README update | M | `npm run seed` produces the scenario; E2E passes locally; README explains `DATOTEKE_DIR` and the E2E command. |

Sizes are relative: S < M < L. M2 is the most important milestone. Take your time there, and ask early.

## 8. Common pitfalls

- **"It works in the UI, so it's secure."** No. Test it as another user in `tests/db`. The UI only hides things; the database must refuse them.
- **Forgetting `security_invoker = true` on a view.** The view would then run with the owner's rights and show everyone's data. `meta.test.ts` catches this. Don't silence it.
- **`security definer` without `set search_path = ''`.** This is a security hole, and `meta.test.ts` catches it too.
- **Using `Date.now()` for deadline logic.** The ESLint purity rule flags it in components. Compare in SQL.
- **Comparing a `numeric` string with a number** (`"10.00" > 9` works by accident; `"10.00" > "9"` does not). Convert with `Number()`.
- **Next.js 16:**
  - `params` and `searchParams` are Promises (`await params`);
  - run `npm run typecheck` after adding routes, so the `PageProps<'/route'>` types are generated.
- **Leaving files on disk when the database call fails.** Always clean up in a `catch` or `finally`.
- **Showing a raw database error to the user.** Always pass errors through `porukaGreske()`.

## 9. Questions? Escalate early

Ask your mentor before you:
- change an existing migration;
- relax an RLS policy;
- add a dependency other than `file-type` and `@playwright/test`;
- deviate from section 1 (Decisions).

When stuck for more than an hour, write down what you tried and ask.
