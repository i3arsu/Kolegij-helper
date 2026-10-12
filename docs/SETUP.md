# Local Development Setup

These steps work on Windows, macOS and Linux. On Windows use PowerShell; Git Bash also works.

## Prerequisites

- **Node.js 22.** Check with `node -v`.
- **Git.**
- **Docker Desktop**, and it must be **running**. On Windows, use the WSL2 backend (the default).

## Steps

### 1. Clone the repository and install dependencies

```bash
git clone https://github.com/i3arsu/Kolegij-helper.git
cd Kolegij-helper
npm install
```

### 2. Create `.env`

```bash
cp .env.example .env              # PowerShell: Copy-Item .env.example .env
```

Open `.env` in your editor (VS Code) and replace **every** `promijeni` with your own value:

- **Passwords:** use **only letters, digits, `-` and `_`**. Docker Compose treats `$` as a variable, so a password containing `$` silently becomes a different password. A quick way to generate one is `node -e "console.log(crypto.randomUUID().replaceAll('-',''))"`.
- **`QR_TAJNA`:** any long random string.
- **`SEED_LOZINKA`:** the password for all demo accounts created by the seed.
- **`DATOTEKE_DIR`:** add the line `DATOTEKE_DIR=./.data/datoteke`. Phase 2 stores uploaded files there.

Each password is written **once**. The app and the scripts build the database connection URLs themselves (`lib/db/url.ts`), so there are no URLs to keep in sync.

> Do not append lines with `echo ... >> .env` in Windows PowerShell 5. It writes UTF-16 and the file becomes unreadable. Edit in an editor instead. Keep line endings as LF; VS Code shows `LF`/`CRLF` in the bottom-right corner.

### 3. Start the database, migrate, seed, run

```bash
npm run db:up          # starts Postgres in Docker and waits until it is healthy
npm run db:migrate     # creates the schema; output ends with "Applied: 0009_gosti.sql"
npm run seed           # demo data; output: "Seed gotov: 25 studenata, 60 termina ..."
npm run dev            # http://localhost:3000
```

Log in as `marko.peric@unipu.test` (lecturer) with the `SEED_LOZINKA` password. The other demo accounts are listed in `README.md`.

### 4. Check that the tests pass

```bash
npm test               # unit tests
npm run test:db        # database / RLS tests (starts its own throwaway Postgres in Docker)
npm run lint
npm run typecheck
```

All four must pass before you start changing code.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run db:up` / `npm run db:down` | Start / stop the dev database (data is kept). |
| `npm run db:down -- -v` | Stop the database **and delete its data**. Use it after changing database passwords. |
| `npm run db:migrate` | Apply new migrations from `db/migrations/`. |
| `npm run db:types` | Regenerate `lib/db/tipovi.ts` from the database. Run it after every migration and commit the result. |
| `npx tsx scripts/db.ts dbmate status` | Show which migrations are applied. |
| `npm run seed` | Reset all data to the demo scenario. Deletes everything in the dev database. |

## Troubleshooting

### `password authentication failed for user "app_owner"` (28P01)

The database was created with different passwords than the ones in your `.env` now. Postgres stores the role passwords **only once**, when the database volume is empty; editing `.env` later does not change them. Recreate the database:

```bash
npm run db:down -- -v
npm run db:up
npm run db:migrate
npm run seed
```

Still failing? Then check these:

1. **`.env` still has old URL lines.** If it contains `OWNER_DATABASE_URL=`, `DATABASE_URL=` or `AUTH_DATABASE_URL=` (from an older `.env.example`), delete those three lines. An explicit URL overrides the one built from the passwords.
2. **A `$` in a password.** Remove it. Use only letters, digits, `-` and `_`.
3. **Another PostgreSQL on the same port.** Run `netstat -ano | findstr :5433` (Windows) or `lsof -i :5433` (macOS). If something other than Docker is listening, set `DB_PORT=5434` in `.env`, then run `npm run db:down` and `npm run db:up`.
4. **`.env` has Windows line endings (CRLF).** Switch it to `LF` in VS Code, save, and recreate the database as above.

### `role "app_owner" does not exist`, or `db:up` fails

The database init script (`db/init/00-uloge.sh`) did not run correctly. The usual cause on Windows is that Git checked the script out with CRLF line endings. The repository's `.gitattributes` prevents this, but a clone made before that fix may still have CRLF files. Run:

```bash
git ls-files --eol db/init/00-uloge.sh     # must show "i/lf  w/lf"
```

If it shows `crlf`, re-checkout the files and recreate the database:

```powershell
git rm -r --cached . -q; git reset --hard    # discards uncommitted changes to tracked files; .env is not touched
npm run db:down -- -v
npm run db:up
```

To see the actual error from the database:

```bash
docker compose -f docker-compose.dev.yml logs db
```

### `bind: An attempt was made to access a socket in a way forbidden by its access permissions`

Windows (Hyper-V) reserves random port ranges between 49152 and 65535. Set a different `DB_PORT` in `.env`, for example `5434`. You can list the reserved ranges with:

```powershell
netsh int ipv4 show excludedportrange protocol=tcp
```

### `failed to connect to the docker API` / `docker: command not found`

Docker Desktop is not running. Start it, wait until it says "Engine running", and try again.

### `npm ci` fails with `Missing: @emnapi/... from lock file` (CI or Docker build)

`package-lock.json` lost some platform-specific entries. This is a known npm bug when dependencies are changed on macOS. Regenerate the lockfile from scratch and commit it:

```bash
rm -rf node_modules package-lock.json     # PowerShell: Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
```
