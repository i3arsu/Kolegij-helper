# Student Progress Tracker: Project Brief

## What it is

A web application for tracking students on a university course (first course: *Programiranje 2*, University of Pula).

- **Lecturers and teaching assistants** use it to:
  - import students from a CSV file;
  - record attendance per session;
  - set and grade assignments;
  - give students feedback over several revision rounds.
- **Students** use it to see their own attendance, points, deadlines and feedback, and nothing about anyone else.

The user interface is in Croatian. It runs on the university's own server, in Docker.

## Who uses it

| Role | Can do |
|---|---|
| **Admin** | Creates courses and staff accounts. |
| **Lecturer** (`nastavnik`) | Full control of their own courses: CSV import, groups, staff, pass rules, sessions, attendance, assignments, grading, password resets. |
| **Teaching assistant** (`asistent`) | Only the groups assigned to them: sessions, attendance and (from Phase 2) grading for students in those groups. |
| **Student** | Read-only view of their own data, and (from Phase 2) submitting their own work. |

Students cannot sign up. Their accounts are created by the CSV import, which generates a one-time password that the lecturer hands out. Students must change it on first login.

## Core requirement: data isolation in the database

A student must never be able to read another student's data, **even if the application code has a bug**. This is enforced by PostgreSQL Row Level Security (RLS), not only by hiding things in the UI.

- **Database role.** The app connects as a database role (`app_user`) that does not own any table and cannot bypass RLS.
- **User context.** Every query runs inside a transaction that first sets the current user: `set_config('app.korisnik_id', <user id>, true)`.
- **Policies.** RLS policies decide which rows that user can see or change.
- **Default is zero rows.** If the user context is missing, every table returns zero rows.
- **Automated tests.** These guarantees are covered by tests (`npm run test:db`) that run against a real Postgres.

## Tech stack

| Layer | Choice |
|---|---|
| Web app | Next.js 16 (App Router, Server Components, Server Actions), TypeScript, Tailwind CSS v4 |
| Database | PostgreSQL 17 with RLS |
| Queries | Kysely (type-safe query builder). Types are generated from the database with `kysely-codegen`. |
| Migrations | Plain SQL files run by dbmate (`db/migrations/`) |
| Auth | Own implementation: email + password (argon2id), sessions stored in the database, lockout after 5 failed attempts |
| Files | Docker volume on the server (from Phase 2) |
| Tests | Vitest (unit tests), Vitest + Testcontainers (database/RLS tests), Playwright (end-to-end, from Phase 2) |
| Deployment | Docker Compose: Postgres, migrations, app, Caddy (HTTPS) |

## Phases

| Phase | Scope | Status |
|---|---|---|
| **1. MVP** | Login, roles, courses and groups, CSV import with preview, sessions, manual attendance, student attendance view, pass rules | **Done** |
| **2. Assignments** | Create and assign assignments, student submissions (file/link/text), grading with comments and templates, revision rounds, late flag | **Next**. See [PHASE-2-PLAN.md](PHASE-2-PLAN.md). |
| 3. Analytics | Warnings (below thresholds, missing submissions), student timeline, charts, CSV export of points and attendance | Planned |
| 4. Extras | QR attendance check-in, email notifications, multiple courses UI, self-service password reset | Planned |

The visual design is still a neutral placeholder. Final styling will be applied from Claude Design materials once they arrive. Until then, build UI from the existing simple components and do not spend time on styling.

## Glossary

The code and database use Croatian names, matching the domain and the UI. This list covers the words you will see most:

| Croatian | English |
|---|---|
| kolegij | course |
| grupa (predavanje / vježbe) | group (lecture / lab) |
| nastavnik / asistent / osoblje | lecturer / teaching assistant / staff |
| student, JMBAG | student, student ID number (10 digits) |
| upis | enrollment (student × course) |
| članstvo grupe | group membership (with a validity period) |
| termin | class session |
| dolazak / dolaznost | attendance record / attendance rate |
| prisutan / odsutan / opravdano | present / absent / excused |
| pravila prolaza, prag | pass rules, threshold |
| zadatak | assignment |
| rok | deadline |
| predaja, verzija | submission, submission version |
| povratna informacija | feedback |
| dorada | revision (sent back for rework) |
| bodovi | points |
| prilog, datoteka | attachment, file |
| uvoz / izvoz | import / export |
| korisnik, lozinka, sesija | user account, password, session |
| akcije.ts | Server Actions file of a route |
| servisi | service layer (business logic) |
| upit() | "query": runs code as the logged-in user, with RLS applied |

## Where to look

- `docs/SETUP.md`: local setup step by step, with Windows troubleshooting.
- `README.md`: overview, commands, deployment (in Croatian).
- `PLAN.md`: the full original plan (in Croatian): data model, RLS rules, edge cases, all phases.
- `db/migrations/`: the schema, RLS policies and database functions. This is the source of truth.
- `tests/db/`: how isolation is tested. Read these before writing your own.
