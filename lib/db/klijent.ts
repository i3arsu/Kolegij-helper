import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import pg from "pg";
import type { DB } from "./tipovi";

export type Baza = Kysely<DB>;
export type Tx = Transaction<DB>;

// timestamptz i date vraćamo kao Date; numeric ostaje string (precizno), pretvara se na rubu.
export function napraviBazu(connectionString: string, max = 10): Baza {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString, max }) }),
  });
}

/**
 * Izvršava fn u transakciji s postavljenim RLS kontekstom (app.korisnik_id).
 * Kontekst vrijedi samo do kraja transakcije pa je siguran uz connection pool.
 * Svi korisnički upiti moraju ići kroz ovu funkciju.
 */
export async function kaoKorisnik<T>(baza: Baza, korisnikId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return baza.transaction().execute(async (tx) => {
    await sql`select set_config('app.korisnik_id', ${korisnikId}, true)`.execute(tx);
    return fn(tx);
  });
}
