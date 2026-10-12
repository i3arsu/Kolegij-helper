/**
 * Alati za bazu koji rade jednako na Windowsu, macOS-u i Linuxu (bez shella).
 * URL vlasnika baze gradi se iz .env (lib/db/url.ts) i prosljeđuje alatu kroz okruženje.
 *
 *   npm run db:migrate              # dbmate up
 *   npm run db:types                # regenerira lib/db/tipovi.ts
 *   npx tsx scripts/db.ts dbmate status   # bilo koja dbmate naredba
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveBinary } from "dbmate";
import { urlBaze } from "../lib/db/url";

const [naredba, ...ostalo] = process.argv.slice(2);
const env = { ...process.env, OWNER_DATABASE_URL: urlBaze("app_owner") };

function pokreni(program: string, argumenti: string[]): never {
  const r = spawnSync(program, argumenti, { stdio: "inherit", env });
  if (r.error) console.error(r.error.message);
  process.exit(r.status ?? 1);
}

const dbmate = (podnaredba: string[]) =>
  pokreni(resolveBinary(), ["--env", "OWNER_DATABASE_URL", "--migrations-dir", "db/migrations", "--no-dump-schema", "--wait", ...podnaredba]);

switch (naredba) {
  case "migrate":
    dbmate(["up"]);
  case "dbmate":
    dbmate(ostalo.length ? ostalo : ["status"]);
  case "types": {
    const paket = join(process.cwd(), "node_modules", "kysely-codegen");
    const bin = JSON.parse(readFileSync(join(paket, "package.json"), "utf8")).bin["kysely-codegen"];
    pokreni(process.execPath, [
      join(paket, bin), "--url", "env(OWNER_DATABASE_URL)",
      "--out-file", "lib/db/tipovi.ts", "--exclude-pattern", "public.schema_migrations",
    ]);
  }
  default:
    console.error("Upotreba: tsx scripts/db.ts migrate | types | dbmate <naredba>");
    process.exit(1);
}
