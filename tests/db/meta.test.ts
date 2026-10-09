import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novoOkruzenje, sql, type Okruzenje } from "./pomocnici";

// Strukturne provjere koje hvataju buduće propuste (nova tablica bez RLS-a, view bez security_invoker…).
let o: Okruzenje;
beforeAll(async () => { o = await novoOkruzenje(); });
afterAll(async () => o.zatvori());

describe("sigurnosna struktura baze", () => {
  it("sve tablice u public imaju uključen RLS", async () => {
    const { rows } = await sql<{ tablica: string }>`
      select c.relname as tablica from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity and c.relname <> 'schema_migrations'
    `.execute(o.vlasnik);
    expect(rows).toEqual([]);
  });

  it("app_user nije vlasnik nijedne tablice i nema BYPASSRLS", async () => {
    const { rows } = await sql<{ rolbypassrls: boolean; posjeduje: number }>`
      select r.rolbypassrls,
             (select count(*)::int from pg_class c where c.relowner = r.oid) as posjeduje
      from pg_roles r where r.rolname = 'app_user'
    `.execute(o.vlasnik);
    expect(rows[0]).toEqual({ rolbypassrls: false, posjeduje: 0 });
  });

  it("app_user ne može čitati lozinka_hash ni sesije", async () => {
    const { rows } = await sql<{ hash: boolean; sesija: boolean; pokusaj: boolean; revizija: boolean }>`
      select has_column_privilege('app_user', 'korisnik', 'lozinka_hash', 'select') as hash,
             has_table_privilege('app_user', 'sesija', 'select') as sesija,
             has_table_privilege('app_user', 'prijava_pokusaj', 'select') as pokusaj,
             has_table_privilege('app_user', 'revizija', 'select') as revizija
    `.execute(o.vlasnik);
    expect(rows[0]).toEqual({ hash: false, sesija: false, pokusaj: false, revizija: false });
  });

  it("svi view-ovi su security_invoker", async () => {
    const { rows } = await sql<{ view: string }>`
      select c.relname as view from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
        and not coalesce('security_invoker=true' = any (c.reloptions), false)
    `.execute(o.vlasnik);
    expect(rows).toEqual([]);
  });

  it("sve security definer funkcije imaju fiksiran search_path", async () => {
    const { rows } = await sql<{ funkcija: string }>`
      select p.proname as funkcija from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and p.prosecdef
        and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
    `.execute(o.vlasnik);
    expect(rows).toEqual([]);
  });

  it("u shemi public nema funkcija koje app_user može pozvati", async () => {
    const { rows } = await sql<{ funkcija: string }>`
      select p.proname as funkcija from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('app_user', p.oid, 'execute')
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    `.execute(o.vlasnik);
    expect(rows).toEqual([]);
  });
});
