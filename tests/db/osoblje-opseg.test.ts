import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { greskaKod, novoOkruzenje, sql, type Okruzenje } from "./pomocnici";
import { postaviScenu, type Scena } from "./scena";

let o: Okruzenje;
let s: Scena;
beforeAll(async () => {
  o = await novoOkruzenje();
  s = await postaviScenu(o.vlasnik);
});
afterAll(async () => o.zatvori());

describe("asistent A (samo V1)", () => {
  it("vidi samo studente svoje grupe", async () => {
    const r = await o.kao(s.A.korisnik, (tx) => tx.selectFrom("student").select("id").execute());
    expect(r.map((x) => x.id)).toEqual([s.S1.student]);
  });

  it("vidi samo termine i dolaske svoje grupe", async () => {
    const r = await o.kao(s.A.korisnik, async (tx) => ({
      termini: await tx.selectFrom("termin").select("id").execute(),
      dolasci: await tx.selectFrom("dolazak").select("termin_id").execute(),
    }));
    expect(r.termini.map((t) => t.id)).toEqual([s.T.V1]);
    expect(new Set(r.dolasci.map((d) => d.termin_id))).toEqual(new Set([s.T.V1]));
  });

  it("ne može evidentirati dolazak na terminu tuđe grupe", async () => {
    const r = await o.kao(s.A.korisnik, async (tx) =>
      (await tx.updateTable("dolazak").set({ status: "prisutan" }).where("termin_id", "=", s.T.V2).executeTakeFirst()).numUpdatedRows);
    expect(r).toBe(0n);
  });

  it("može evidentirati dolazak u svojoj grupi", async () => {
    const r = await o.kao(s.A.korisnik, async (tx) =>
      (await tx.updateTable("dolazak").set({ status: "opravdano" }).where("termin_id", "=", s.T.V1).executeTakeFirst()).numUpdatedRows);
    expect(r).toBe(1n);
  });

  it("ne smije mijenjati pravila, uvoziti ni resetirati lozinke", async () => {
    const pravila = await o.kao(s.A.korisnik, async (tx) =>
      (await tx.updateTable("pravila_prolaza").set({ min_dolaznost_vjezbi: 0 }).executeTakeFirst()).numUpdatedRows);
    expect(pravila).toBe(0n);
    expect(await greskaKod(o.kao(s.A.korisnik, (tx) => sql`select private.uvezi_studente(${s.K1}, '[]'::jsonb, now(), null)`.execute(tx)))).toBe("42501");
    expect(await greskaKod(o.kao(s.A.korisnik, (tx) => sql`select private.resetiraj_lozinku(${s.S1.student}, 'x')`.execute(tx)))).toBe("42501");
  });

  it("vidi gosta iz druge grupe na svom terminu i nalazi ga po JMBAG-u", async () => {
    const id = await o.kao(s.A.korisnik, async (tx) =>
      (await sql<{ id: string }>`select private.nadji_studenta_za_termin(${s.T.V1}, '0000000002') as id`.execute(tx)).rows[0].id);
    expect(id).toBe(s.S2.student);
    await o.kao(s.A.korisnik, (tx) =>
      tx.insertInto("dolazak").values({ termin_id: s.T.V1, student_id: id, status: "prisutan", gost: true }).execute());
    const vidljivi = await o.kao(s.A.korisnik, (tx) => tx.selectFrom("student").select("id").execute());
    expect(new Set(vidljivi.map((x) => x.id))).toEqual(new Set([s.S1.student, s.S2.student]));
  });
});

describe("nastavnik N", () => {
  it("vidi sve studente svog kolegija, ali ne i tuđeg", async () => {
    const r = await o.kao(s.N.korisnik, (tx) => tx.selectFrom("student").select("id").execute());
    expect(new Set(r.map((x) => x.id))).toEqual(new Set([s.S1.student, s.S2.student]));
  });

  it("ne vidi kolegij K2 ni njegove termine", async () => {
    const r = await o.kao(s.N.korisnik, (tx) => tx.selectFrom("kolegij").select("id").execute());
    expect(r.map((k) => k.id)).toEqual([s.K1]);
  });

  it("ne može se dodati na tuđi kolegij", async () => {
    expect(await greskaKod(o.kao(s.N.korisnik, (tx) =>
      tx.insertInto("osoblje_kolegija").values({ kolegij_id: s.K2, osoblje_id: s.N.osoblje, uloga: "nastavnik" }).execute()))).toBe("42501");
  });

  it("dolazak studenta koji nije član grupe odbija trigger", async () => {
    expect(await greskaKod(o.kao(s.N.korisnik, (tx) =>
      tx.insertInto("dolazak").values({ termin_id: s.T.V2, student_id: s.S1.student, status: "prisutan" }).execute()))).toBe("P0001");
  });

  it("izmjena dolaska upisuje se u reviziju", async () => {
    await o.kao(s.N.korisnik, (tx) => tx.updateTable("dolazak").set({ status: "odsutan" })
      .where("termin_id", "=", s.T.P1).where("student_id", "=", s.S1.student).execute());
    const { rows } = await sql<{ autor: string; staro: { status: string }; novo: { status: string } }>`
      select autor, staro, novo from revizija where tablica = 'dolazak' and radnja = 'update' order by id desc limit 1`.execute(o.vlasnik);
    expect(rows[0].autor).toBe(s.N.korisnik);
    expect(rows[0].staro.status).toBe("prisutan");
    expect(rows[0].novo.status).toBe("odsutan");
  });
});
