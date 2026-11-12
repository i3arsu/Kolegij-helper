# Phase 3 Implementation Plan: Warnings, Analytics, Export

Audience: the developer implementing Phase 3. Read [BRIEF.md](BRIEF.md) first if you haven't. Everything in [PHASE-2-PLAN.md](PHASE-2-PLAN.md) §2 (setup, rules of this codebase, workflow) and §8 (pitfalls) still applies. This plan only adds to it.

## Brief

Phases 1 and 2 collect the data: attendance per session, and assignments with submissions, feedback and points. Phase 3 turns that data into answers for the lecturer:

- **Who is in trouble?** A warnings page lists students below an attendance threshold, students who can no longer reach a threshold, students with three absences in a row, missing submissions and revisions that were never resubmitted.
- **How is the course going?** A full course summary, an analytics page with a few simple charts, and a timeline of everything that happened to one student.
- **Can I get it into Excel?** A CSV export of attendance and points that opens correctly in Croatian Excel, with diacritics.
- **Where do I stand?** Students get progress bars for attendance and points against the course thresholds.

Almost all of Phase 3 is **read-only**. It adds no new way to change data, except one new setting (planned total points). The work is mostly SQL views, plus pages that display them. The hard part is getting the definitions right and proving with tests that RLS still limits every view: an assistant sees only their groups, and a student sees only themselves.

**Prerequisite:** Phase 2 must be finished first. M1–M6 are merged (assignments, submissions, attachments, deadline extensions, comment templates, student pages, review screen); only M7 (seed and Playwright) remains. Phase 3 reads the data those milestones produce, and M7 sets up Playwright, which Phase 3 extends.

## 0. Goal

At the end of Phase 3:

- **Lecturer:**
  - sees a warnings page for the course, filterable by warning type and group;
  - sees a fuller course summary, with warning counts and points status;
  - opens a student profile and sees their points, warnings and timeline;
  - views an analytics page with attendance, submission and points charts;
  - downloads two CSV exports: a summary and a detailed attendance matrix.
- **Teaching assistant:** sees all of the above, limited by RLS to the students in their own groups. This includes the export.
- **Student:** sees attendance and points progress bars against the thresholds on their dashboard.
- **Isolation:** every new view is `security_invoker`. Tests prove that a student sees only their own rows and an assistant only their groups.

Out of scope for Phase 3 (do **not** build these):

- email notifications and weekly digests (Phase 4);
- storing, acknowledging or dismissing warnings (warnings are computed, see D3);
- a warnings list for students;
- XLSX or PDF export;
- a UI for changing warning thresholds (they are constants, see D4);
- chart libraries and styling beyond the existing tokens (see D7);
- materialized views or any other caching.

## 1. Decisions (defaults until confirmed)

As in Phase 2: build with these defaults, keep each one in one place, and your mentor will tell you if one changes.

| # | Question | Default for now |
|---|---|---|
| D1 | Which points count towards the threshold? | Only points of **accepted** submissions (`status = 'prihvaceno'`). Points given with "returned for revision" are **provisional**: they are shown separately and do not count. |
| D2 | How do we know a points threshold is out of reach, when not all assignments are published yet? | New optional setting `pravila_prolaza.planirano_bodova` (planned total points for the course). **Lost points** come from two sources: an accepted submission loses `max_bodova − bodovi`, and a missed one (not submitted, deadline passed, late submission not allowed) loses all `max_bodova`. The student is at **risk** when `planirano_bodova − lost < min_bodova`. If `planirano_bodova` is null, there is no points-risk warning. |
| D3 | Are warnings stored? | **No.** They are computed by a view, like the late flag in Phase 2. When the data changes, the warning appears or disappears by itself. |
| D4 | Warning thresholds | **Constants**, defined once at the top of `v_upozorenja`: at least **3** held sessions before an "attendance below threshold" warning; **3** absences in a row; a revision unanswered for more than **7** days when the reviewer set no revision deadline (with a deadline, the warning starts when it passes). |
| D5 | Who sees warnings? | Staff of the course, with assistants limited to their groups (RLS does this). Students do not get a warnings page in Phase 3. |
| D6 | CSV format | UTF-8 **with BOM**, CRLF line endings. Croatian export (`hr`): separator `;` and decimal comma. English export (`en`): separator `,` and decimal point. These are what Excel expects in each locale. Do **not** write a `sep=` line, because Excel then ignores the BOM and breaks the diacritics. |
| D7 | Charts | **No chart library.** Write a few small SVG components that use the existing colour tokens. Every chart also shows its numbers as a table, for accessibility. |
| D8 | Timeline contents | Attendance per session, submission versions (with the late flag), feedback decisions (with points), deadline extensions and group changes. Feedback **comment text is not** part of the timeline; it stays on the submission page. |

## 2. Before you start

### Read first

1. **`db/migrations/0007_view_dolaznost.sql`**: how attendance is counted. Phase 3 reuses its `relevantni` logic exactly.
2. **`db/migrations/0013_view_predaja.sql`**, **`0018_rokovi_produljenja.sql`** and **`0019_citanje_dodijeljenih_grupa.sql`**: `v_predaja`, its effective deadline (`greatest(...)`), `rok_prosao`, and how group-assigned work becomes visible to students (`private.zadatak_dodijeljen`) and to staff.
3. **`lib/servisi/sazetak.ts`** and **`app/[locale]/nastava/[kolegijId]/page.tsx`**: the current course summary. You will extend it.
4. **`app/[locale]/nastava/[kolegijId]/studenti/page.tsx`**: the student list and its filters (`grupa`, `q`, `ispod`, `ispisani`).
5. **`app/api/datoteke/[id]/route.ts`**: the pattern for a GET route handler that returns a file with the right headers. The export follows it.
6. **`tests/db/osoblje-opseg.test.ts`** and **`tests/db/izolacija-studenta.test.ts`**: you will extend both.
7. **Helpers from Phase 2 that you should reuse, not rewrite:**
   - `lib/domena/statusi.ts` (`TON_STATUSA`, `KLJUC_STATUSA`);
   - `lib/domena/broj.ts` (`formatBroj`, for the UI only, see §8);
   - `lib/domena/datoteke.ts` (`formatVelicina`);
   - `rokZaPredajuSql()` in `lib/servisi/zadaci-studenta.ts` shows which deadline applies to the next submission: the revision deadline for `vraceno_na_doradu`, `rok_verzije` for a submitted revision. The views need the same rule. Write it once in SQL, and don't add a second TypeScript copy.

### Extra rules for Phase 3

These come on top of the rules in Phase 2 §2.

1. **Aggregates run under the caller's RLS.**
   - Every new view uses `with (security_invoker = true)`; `meta.test.ts` enforces this.
   - Never use a `security definer` function to make an assistant's analytics "complete". An assistant sees statistics for their groups only. That is the intended behaviour, not a bug.
2. **No materialized views.** They cannot use `security_invoker` and would show everyone's data to everyone. If a page is slow (> 500 ms with the seed data), tell your mentor; do not cache.
3. **Definitions live in SQL, once.** Thresholds, "at risk", "currently meets" and the warning rules are defined in the views. TypeScript only formats and displays them.
   - `lib/domena/dolaznost.ts` is an existing mirror of `v_dolaznost`, kept for a test. Don't add new mirrors.
4. **Tests that depend on time use dates relative to `now()`**, as the deadline-extension tests do (`Date.now() ± n days`). Never hardcode a date that will pass.
5. **CSV formula injection.** Names come from an imported CSV and can contain anything. Any cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return must be prefixed with `'`, or Excel will execute it as a formula. This is a security requirement and has a unit test (§6).

## 3. Data model

Use the next free migration numbers. At the time of writing these are `0022`, `0023` and `0024` (Phase 2 used up to `0021`). If later fixes take them, shift by the same amount. Every migration needs a correct `-- migrate:down`. After each one, run `npm run db:migrate && npm run db:types` and commit `lib/db/tipovi.ts`.

| File | Contents |
|---|---|
| `0022_bodovi.sql` | `pravila_prolaza.planirano_bodova`, `v_dolazak_studenta`, `v_bodovi`, `v_prolaz` |
| `0023_upozorenja.sql` | `v_upozorenja` |
| `0024_vremenska_crta.sql` | `v_vremenska_crta` |

### 3.1 `0022_bodovi.sql`

```sql
-- migrate:up
alter table pravila_prolaza
  add column planirano_bodova numeric(6,2) check (planirano_bodova > 0);  -- null = not set (D2)
```

**`v_dolazak_studenta`**: one row per (student × counted session).

- Columns: `kolegij_id, student_id, tip, grupa_id, termin_id, pocetak, status` (`'prisutan' | 'odsutan' | 'opravdano'`).
- Use **exactly** the `relevantni` CTE from `v_dolaznost`: active enrollments, membership valid at the session start, not cancelled, attendance saved, missing record = `odsutan`.
- A DB test asserts that counting this view per (student, type) gives the same `odrzano / prisutan / opravdano / odsutan` as `v_dolaznost`.
- The warnings view, the analytics page and the attendance-matrix export all read from it.

**`v_bodovi`**: one row per **active** enrollment, including students with no assignments yet.

| Column | Meaning |
|---|---|
| `kolegij_id, student_id` | |
| `prihvaceno` | sum of `bodovi` where `status = 'prihvaceno'` (0 if none) |
| `privremeno` | sum of `bodovi` where status is not `prihvaceno` (provisional, D1) |
| `max_objavljeno` | sum of `max_bodova` over the published assignments assigned to the student |
| `izgubljeno` | lost points (D2) |
| `min_bodova, planirano_bodova` | from `pravila_prolaza` |
| `zadovoljava` | `prihvaceno >= min_bodova` |
| `rizik` | `planirano_bodova is not null and planirano_bodova - izgubljeno < min_bodova` |

- Build it as `upis` (active) left-joined to `v_predaja` joined to `zadatak`, plus `pravila_prolaza`.
- `v_predaja` already applies the effective deadline and RLS. Do not recompute either.

**`v_prolaz`**: "currently meets the pass rules", one row per active enrollment. It is the only definition of overall pass status; the export and the student list use it.

- Columns: `kolegij_id, student_id, dolaznost_p, dolaznost_v, dolaznost_p_ok, dolaznost_v_ok, bodovi_ok, zadovoljava`.
- `*_ok` is null when there is no data yet (for example no held lab sessions).
- `zadovoljava` uses three-valued logic. It is false if any `*_ok` is false; otherwise null if any is null; otherwise true.

  ```sql
  case when dolaznost_p_ok is false or dolaznost_v_ok is false or bodovi_ok is false then false
       when dolaznost_p_ok is null  or dolaznost_v_ok is null  or bodovi_ok is null  then null
       else true end as zadovoljava
  ```

The settings page (`postavke`) gets one new field for `planirano_bodova` in the pass-rules form. It is optional, and the help text explains D2.

### 3.2 `0023_upozorenja.sql`

**`v_upozorenja`**: one row per active warning.

- Columns: `kolegij_id, student_id, vrsta, tip, zadatak_id, vrijednost, od`.
- `tip` (lecture/lab) is set only for attendance warnings; `zadatak_id` only for assignment warnings.
- `vrijednost` is a number for display: the current %, the number of days, or the lost points.
- `od` is when the situation started; the UI sorts and filters by it.
- Start the view with one CTE that holds the D4 constants, so they live in one place:

```sql
with konstante as (
  select 3 as min_odrzanih, 3 as uzastopnih, interval '7 days' as dorada_rok
), ...
```

Only students with an **active** enrollment get warnings. Join `upis` with `status = 'aktivan'`: `v_predaja` can also contain withdrawn students who submitted earlier.

| `vrsta` | When | `vrijednost` / `od` |
|---|---|---|
| `dolaznost_ispod_praga` | `v_dolaznost.postotak < prag`, `odrzano >= min_odrzanih`, **and** not `dolaznost_rizik` for the same type (no duplicates) | current %; `od` null |
| `dolaznost_rizik` | Even if the student attends every remaining session, the percentage stays below `prag`. **Remaining** = sessions of the student's current group of that type, not cancelled, `pocetak > now()`. Compute the best possible % with the same `opravdano_se_racuna` rule as `v_dolaznost`. | best possible %; `od` null |
| `uzastopni_izostanci` | The student's last `uzastopnih` counted sessions of a type, ignoring `opravdano`, are all `odsutan`. Use `row_number() over (partition by student_id, tip order by pocetak desc)` on `v_dolazak_studenta`. | number of absences in the streak; `od` = start of the oldest one |
| `nepredano` | `v_predaja.status = 'nije_predano' and rok_prosao`, one row per assignment | days since the deadline; `od` = `rok` |
| `dorada_bez_predaje` | `status = 'vraceno_na_doradu'` and, for the feedback on `trenutna_verzija`: if `rok_dorade` is set, it has passed; if it is null, the feedback is older than `dorada_rok` | days since `od`; `od` = `rok_dorade` if set, otherwise feedback `created_at` |
| `bodovi_rizik` | `v_bodovi.rizik` | `izgubljeno`; `od` null |

`vrsta` values are API: the UI translates them via `messages/*.json` (`warnings.types.<vrsta>`). Adding a value later means adding a translation, and the i18n test checks key parity.

### 3.3 `0024_vremenska_crta.sql`

**`v_vremenska_crta`**: one row per event, a `union all` of the sources in D8.

| `vrsta` | Source | `vrijeme` |
|---|---|---|
| `dolazak` | `v_dolazak_studenta` | `pocetak` |
| `predaja` | `v_predaja_verzija` | `predano_at` |
| `povratna_informacija` | `povratna_informacija` joined to `predaja` | `created_at` |
| `produljenje` | `produzenje_roka` | `created_at` |
| `promjena_grupe` | `clanstvo_grupe` joined to `upis` | `lower(vrijedi)` |

- Columns: `kolegij_id, student_id, vrijeme, vrsta`, plus **typed nullable columns** for the details: `termin_id, zadatak_id, predaja_id, grupa_id, status text, broj int, bodovi numeric, kasni boolean, datum timestamptz` (for `novi_rok`).
- Don't use `jsonb` here. Typed columns give useful types from `kysely-codegen`.

## 4. Export

### Modules

**`lib/izvoz/csv.ts`** (pure functions, no database):

- `uCsv(redovi: (string | number | null)[][], locale)` returns the full file as a string, following D6:
  - BOM;
  - separator and decimal mark by locale;
  - CRLF line endings;
  - quotes around any cell containing the separator, `"`, CR or LF, with `"` doubled;
  - the formula-injection prefix (rule 5);
  - `null` as an empty cell.
- Numbers are formatted here. `numeric` columns arrive as strings, so convert them with `Number()` first.

**`lib/servisi/izvoz.ts`**: two queries, run inside `upit()`.

- `izvozSazetka(tx, kolegijId)`, one row per active student, sorted by surname then name with Croatian collation:
  - JMBAG, surname, name;
  - lecture group, lab group (current memberships);
  - attendance P %, attendance V %;
  - **one column per published assignment** (accepted points, empty if none);
  - total accepted;
  - currently meets (`v_prolaz.zadovoljava`: yes / no / empty).
- `izvozDolaznosti(tx, kolegijId)`, the detailed attendance matrix built from `v_dolazak_studenta`:
  - one row per student, one column per held session (header: date and group);
  - cell values `P` / `O` / `Opr` (`P` / `A` / `E` in English);
  - empty when the student was not in that session's group.

### Route

**`GET /api/izvoz/[kolegijId]/route.ts?vrsta=sazetak|dolaznost&locale=hr|en`**

1. Require a session, as `/api/datoteke/[id]` does.
2. Validate `kolegijId` with `z.uuid()`. Read `locale` with `jezikIz()` from `i18n/obrazac.ts`.
3. Allow only staff of the course: on any other user, or an unknown course, respond **404**. An unknown `vrsta` gets 400.
4. Build the rows inside `upit()`, so an assistant automatically exports only their groups.
5. Respond with these headers:
   - `Content-Type: text/csv; charset=utf-8`
   - `Content-Disposition: attachment; filename*=UTF-8''<encoded name>`. The name comes from the course code and the database's current date, e.g. `PRG2-sazetak-2026-11-15.csv`.
   - `X-Content-Type-Options: nosniff`
   - `Cache-Control: private, no-store`
6. Header row text and the `P/O/Opr` letters come from `messages/*.json` (namespace `export`) in the requested locale.

`/api` is not in the `proxy.ts` matcher; leave it that way, because the handler checks the session itself.

## 5. Pages and features

### Lecturer and assistant (`app/[locale]/nastava/[kolegijId]/…`)

| Route | What it does |
|---|---|
| (layout) | Add three tabs to the course navigation: **Upozorenja**, **Analitika**, **Izvoz**. Assistants see them too. |
| `page.tsx` (summary) | New cards: **Upozorenja** (count per type, each linking to the warnings page filtered by that type) and **Bodovi** ("N of M students currently meet the points threshold", "K at risk"). |
| `upozorenja/page.tsx` | Table from `v_upozorenja` with these columns: student (link to profile), groups, warning type badge (`Oznaka`), detail text built from `vrijednost` (e.g. "62 % (threshold 75 %)", "assignment *Vezane liste*, 4 days"), and `od`. Filters `vrsta` and `grupa` go in `searchParams`, like the student list. Show the counts per type above the table. An empty state says "No warnings". |
| `analitika/page.tsx` | Three charts (D7), each with a table under it: **(1)** attendance % per week, separately for lectures and labs, from `v_dolazak_studenta`; **(2)** submission status per published assignment (stacked bars), from `v_predaja`; **(3)** average accepted points per assignment as a % of `max_bodova`, with the number of accepted submissions. |
| `izvoz/page.tsx` | Two download links to the route (summary, attendance matrix), passing the current `locale`, with one sentence on what each contains. Assistants also see a note that the export contains only their groups. |
| `studenti/page.tsx` | New columns: accepted points / `min_bodova`, and a warning-count badge. New filter `upozorenje` (any, or one specific type). |
| `studenti/[studentId]/page.tsx` | New cards: **Bodovi** (points bar, accepted vs provisional, per-assignment list if not already there from Phase 2), **Upozorenja** (this student's rows), **Vremenska crta** (newest first, 100 rows, then a "Show all" link with `?sve=1`). |
| `postavke/page.tsx` | `planirano_bodova` field in the pass-rules form (§3.1). |

### Student (`app/[locale]/moj/[kolegijId]/…`)

| Route | What it does |
|---|---|
| `page.tsx` (dashboard) | Next to the existing attendance bars (`TrakaPostotka`), add a **points bar**: accepted points against `min_bodova`, provisional points as a note, and "Currently meets the pass rules: yes / no / not enough data yet" from `v_prolaz`. |

### Components

- **`components/grafovi.tsx`**: `StupcaniGraf` (vertical bars, optionally stacked) and nothing more until it is needed.
  - Plain SVG with a `viewBox`, so it scales.
  - Colours only from the theme tokens (`fill-naglasak`, `fill-uspjeh`, `fill-upozorenje`, `fill-greska`, `stroke-rub`), so dark mode works.
  - A `<title>` and an `aria-label`; the numbers are always also in the table under the chart.
- **`components/ui.tsx`**: you may add one `TrakaBodova` (value, threshold, optional max) next to `TrakaPostotka`, using the same markup. No other changes.

All new text goes into `messages/hr.json` and `messages/en.json`, in new namespaces: `warnings`, `analytics`, `export`, `timeline`.

## 6. Tests (required, part of each milestone)

### Database tests (`tests/db/`)

Extend `scena-zadaci.ts` (or add `scena-analitika.ts`) with what you need. Don't change the existing scene, because other tests depend on it. Use dates relative to `now()` (rule 4).

**`bodovi.test.ts`**
- `v_dolazak_studenta` counts match `v_dolaznost` for every student and type in the scene.
- Accepted points count; provisional points don't; a student with no assignments gets a row with zeros.
- Lost points: an accepted 7/10 loses 3; a missed assignment with late submission disallowed loses all 10; one that still allows late submission loses nothing.
- `rizik` with `planirano_bodova` set and not set.
- `v_prolaz.zadovoljava` returns true, false and null in the right cases.

**`upozorenja.test.ts`**: for each `vrsta`, one case that produces it and one that doesn't.
- `dolaznost_ispod_praga`: not shown with only 2 held sessions; not shown together with `dolaznost_rizik`.
- `uzastopni_izostanci`: an excused session inside the streak doesn't break it; a present one does.
- `nepredano`: not shown before the deadline or for an extended deadline (using `produzenje_roka`).
- `dorada_bez_predaje`: without a revision deadline, shown after 8 days, not after 6 days; with a revision deadline 10 days out, not shown after 8 days, shown once that deadline has passed; never after resubmitting.
- No warnings for a withdrawn student (`ispisan`).

**`vremenska-crta.test.ts`**
- Each source produces its event type with the right `vrijeme`.
- The timeline of S1 contains no rows for S2.

**Extend `izolacija-studenta.test.ts`**
- As S1, each new view (`v_dolazak_studenta`, `v_bodovi`, `v_prolaz`, `v_upozorenja`, `v_vremenska_crta`) returns only S1's rows, and filtering by S2 returns 0.
- The no-context test covers the new views.

**Extend `osoblje-opseg.test.ts`**
- The assistant of V1 sees only V1 students in every new view, so the aggregates on the analytics page cover only V1.

`meta.test.ts` checks `security_invoker` on the new views automatically.

### Unit tests (`tests/unit/`)

- **`izvoz.test.ts`** for `uCsv`:
  - starts with a BOM;
  - uses `;` and decimal comma for `hr`, `,` and decimal point for `en`;
  - quotes cells containing the separator, quotes and newlines;
  - prefixes cells starting with `=`, `+`, `-` and `@`;
  - keeps `č ć đ š ž` intact;
  - writes `null` as an empty cell.
- **Export route test** (like `predaje-route.test.ts`): an invalid UUID returns 404, an unknown `vrsta` returns 400, a student gets 404, and the headers are correct.

### End-to-end (milestone M7)

Extend the Phase 2 Playwright setup:

1. **Happy path:**
   - the lecturer opens the warnings page and sees the seeded below-threshold students;
   - they download the summary export, and the test checks the BOM, the separator and one known row.
2. **Isolation:**
   - logged in as a student, the export URL, `/nastava/<k>/upozorenja` and `/nastava/<k>/analitika` all return 404 or a redirect;
   - logged in as the V1 assistant, the export contains no V2 students.

## 7. Milestones

| # | Pull request | Size | Done when |
|---|---|---|---|
| **M0** | Prerequisites and reading (no PR) | S | Phase 2 M7 is merged; both test suites are green; you can explain `v_dolaznost`'s `relevantni` CTE and why an assistant's analytics show only their groups. |
| **M1** | `0022_bodovi.sql` + `bodovi.test.ts` + isolation/assistant tests for its views + the `planirano_bodova` settings field | M | All tests pass; `meta` passes; `npm run db:types` committed. |
| **M2** | `0023_upozorenja.sql` + `upozorenja.test.ts` + isolation/assistant tests | L | Every warning type has a positive and a negative test. **Mentor reviews the SQL before you continue.** |
| **M3** | `0024_vremenska_crta.sql` + `vremenska-crta.test.ts` | S | All tests pass. |
| **M4** | Export: `lib/izvoz/csv.ts`, `lib/servisi/izvoz.ts`, the route, the `izvoz` page, unit tests | M | Both files open correctly in Excel on Windows, Croatian locale: columns split, diacritics correct, decimals correct. |
| **M5** | Staff pages: warnings page, summary cards, student list columns and filter, student profile cards (points, warnings, timeline) | M | With seed data, the warnings page shows the expected students, and every count on the summary links to a matching filtered list. |
| **M6** | `components/grafovi.tsx`, the analytics page, the student dashboard points bar | M | Charts render in light and dark mode, each with its table; a student sees their own bars only. |
| **M7** | Seed scenario for every warning type, E2E tests, README section on export, BRIEF.md phase status | M | `npm run seed` produces at least one student per warning type (including the 3 below the attendance threshold from `PLAN.md` §12, and `planirano_bodova` set); E2E passes locally. |

M2 is the most important milestone, as M2 was in Phase 2. The warning definitions are what lecturers will act on, so take your time and ask early.

## 8. Common pitfalls

- **An aggregate that looks right as the lecturer but wrong as the assistant.** Always test views as both roles. The assistant's numbers must be computed over their groups only, and they must still make sense (e.g. "N of M students").
- **Counting a withdrawn student.** `v_predaja` keeps students who submitted before withdrawing. Every count and warning goes through active enrollments.
- **Duplicating the attendance rule.** If you write a second version of "which sessions count", the numbers will drift apart. Reuse `v_dolazak_studenta` and keep its test.
- **`now()` inside tests.** A test that passes today and fails next month is worse than no test. Use relative dates.
- **Charts that only work in light mode.** Use the theme tokens, never hex colours.
- **Opening a CSV by double-click on macOS** is not proof it works in Excel on Windows. Check on Windows (M4).
- **Formula injection** looks harmless in tests and becomes a real attack once a student types `=HYPERLINK(...)` as their name. Keep the escape and its test.
- **Reusing `formatBroj` in the CSV.** It uses `Intl.NumberFormat` with grouping, so `1234.5` becomes `1.234,5` in Croatian, and Excel reads that as text. The CSV needs a plain number with only the decimal mark swapped. Write that in `lib/izvoz/csv.ts` and test it with a value above 1000.

## 9. Questions? Escalate early

Ask your mentor before you:

- change an existing view (`v_dolaznost`, `v_predaja`) instead of adding a new one;
- add any npm dependency (none are planned for Phase 3);
- add a `security definer` function (none are planned for Phase 3);
- deviate from section 1 (Decisions), especially the warning definitions.

When stuck for more than an hour, write down what you tried and ask.
