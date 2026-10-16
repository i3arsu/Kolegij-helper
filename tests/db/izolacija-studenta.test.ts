import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { greskaKod, novoOkruzenje, sql, type Okruzenje } from "./pomocnici";
import { postaviScenu, type Scena } from "./scena";

// Najvažniji testovi: student smije vidjeti samo vlastite podatke, bez obzira na upit.
let o: Okruzenje;
let s: Scena;
beforeAll(async () => {
  o = await novoOkruzenje();
  s = await postaviScenu(o.vlasnik);
});
afterAll(async () => o.zatvori());

describe("student S1 čita samo svoje podatke", () => {
  it("student: samo vlastiti red", async () => {
    const r = await o.kao(s.S1.korisnik, (tx) => tx.selectFrom("student").select("id").execute());
    expect(r.map((x) => x.id)).toEqual([s.S1.student]);
  });

  it("izravan upit za tuđi ID vraća 0 redova", async () => {
    const r = await o.kao(s.S1.korisnik, async (tx) => ({
      student: await tx.selectFrom("student").select("id").where("id", "=", s.S2.student).execute(),
      dolazak: await tx.selectFrom("dolazak").select("termin_id").where("student_id", "=", s.S2.student).execute(),
      upis: await tx.selectFrom("upis").select("id").where("student_id", "=", s.S2.student).execute(),
      dolaznost: await tx.selectFrom("v_dolaznost").select("tip").where("student_id", "=", s.S2.student).execute(),
      korisnik: await tx.selectFrom("korisnik").select("email").where("id", "=", s.S2.korisnik).execute(),
    }));
    expect(r).toEqual({ student: [], dolazak: [], upis: [], dolaznost: [], korisnik: [] });
  });

  it("dolazak, upis, članstvo i v_dolaznost sadrže samo S1", async () => {
    const r = await o.kao(s.S1.korisnik, async (tx) => ({
      dolazak: await tx.selectFrom("dolazak").select("student_id").execute(),
      upis: await tx.selectFrom("upis").select("student_id").execute(),
      clanstva: await tx.selectFrom("clanstvo_grupe").select("grupa_id").execute(),
      dolaznost: await tx.selectFrom("v_dolaznost").select("student_id").execute(),
    }));
    expect(new Set(r.dolazak.map((x) => x.student_id))).toEqual(new Set([s.S1.student]));
    expect(r.upis.map((x) => x.student_id)).toEqual([s.S1.student]);
    expect(new Set(r.clanstva.map((x) => x.grupa_id))).toEqual(new Set([s.G.P1, s.G.V1]));
    expect(new Set(r.dolaznost.map((x) => x.student_id))).toEqual(new Set([s.S1.student]));
  });

  it("join preko termina ne otkriva tuđe dolaske", async () => {
    const { rows } = await o.kao(s.S1.korisnik, (tx) =>
      sql<{ student_id: string }>`select d.student_id from termin t join dolazak d on d.termin_id = t.id`.execute(tx),
    );
    expect(rows.every((r) => r.student_id === s.S1.student)).toBe(true);
  });

  it("vidi samo svoje grupe i termine, ne V2", async () => {
    const r = await o.kao(s.S1.korisnik, async (tx) => ({
      grupe: await tx.selectFrom("grupa").select("id").execute(),
      termini: await tx.selectFrom("termin").select("id").execute(),
    }));
    expect(new Set(r.grupe.map((g) => g.id))).toEqual(new Set([s.G.P1, s.G.V1]));
    expect(new Set(r.termini.map((t) => t.id))).toEqual(new Set([s.T.P1, s.T.V1]));
  });

  it("ne vidi kolegij na koji nije upisan", async () => {
    const r = await o.kao(s.S1.korisnik, (tx) => tx.selectFrom("kolegij").select("id").execute());
    expect(r.map((k) => k.id)).toEqual([s.K1]);
  });

  it("ne vidi dnevnik uvoza ni korisnike drugih studenata", async () => {
    const r = await o.kao(s.S1.korisnik, async (tx) => ({
      uvoz: await tx.selectFrom("uvoz").select("id").execute(),
      korisnici: await tx.selectFrom("korisnik").select("id").execute(),
    }));
    expect(r.uvoz).toEqual([]);
    expect(r.korisnici.map((k) => k.id)).toEqual([s.S1.korisnik]);
  });

  it("nema pristup lozinkama, sesijama, pokušajima prijave ni reviziji", async () => {
    expect(await greskaKod(o.kao(s.S1.korisnik, (tx) => sql`select lozinka_hash from korisnik`.execute(tx)))).toBe("42501");
    expect(await greskaKod(o.kao(s.S1.korisnik, (tx) => sql`select * from sesija`.execute(tx)))).toBe("42501");
    expect(await greskaKod(o.kao(s.S1.korisnik, (tx) => sql`select * from prijava_pokusaj`.execute(tx)))).toBe("42501");
    expect(await greskaKod(o.kao(s.S1.korisnik, (tx) => sql`select * from revizija`.execute(tx)))).toBe("42501");
  });
});

describe("student S1 ne može ništa mijenjati", () => {
  it("ne može upisati vlastiti dolazak", async () => {
    const kod = await greskaKod(o.kao(s.S1.korisnik, (tx) =>
      tx.insertInto("dolazak").values({ termin_id: s.T.P1, student_id: s.S1.student, status: "prisutan" })
        .onConflict((oc) => oc.columns(["termin_id", "student_id"]).doUpdateSet({ status: "prisutan" })).execute()));
    expect(kod).toBe("42501");
  });

  it("UPDATE/DELETE nad dolascima ne pogađa nijedan red", async () => {
    const r = await o.kao(s.S1.korisnik, async (tx) => ({
      upd: (await tx.updateTable("dolazak").set({ status: "prisutan" }).executeTakeFirst()).numUpdatedRows,
      del: (await tx.deleteFrom("dolazak").executeTakeFirst()).numDeletedRows,
    }));
    expect(r).toEqual({ upd: 0n, del: 0n });
  });

  it("ne može se dodati kao osoblje ni kreirati termin/grupu", async () => {
    expect(await greskaKod(o.kao(s.S1.korisnik, (tx) => tx.insertInto("grupa").values({ kolegij_id: s.K1, naziv: "X", tip: "vjezbe" }).execute()))).toBe("42501");
    expect(await greskaKod(o.kao(s.S1.korisnik, (tx) =>
      tx.insertInto("termin").values({ kolegij_id: s.K1, grupa_id: s.G.V1, pocetak: new Date(), kraj: new Date(Date.now() + 1e6) }).execute()))).toBe("42501");
    expect(await greskaKod(o.kao(s.S1.korisnik, (tx) =>
      tx.insertInto("student").values({ korisnik_id: s.S1.korisnik, jmbag: "1111111111", ime: "a", prezime: "b" }).execute()))).toBe("42501");
  });

  it("ne može mijenjati upis, pravila ni kolegij", async () => {
    const r = await o.kao(s.S1.korisnik, async (tx) => ({
      upis: (await tx.updateTable("upis").set({ status: "ispisan" }).executeTakeFirst()).numUpdatedRows,
      pravila: (await tx.updateTable("pravila_prolaza").set({ min_dolaznost_vjezbi: 0 }).executeTakeFirst()).numUpdatedRows,
      kolegij: (await tx.updateTable("kolegij").set({ naziv: "hak" }).executeTakeFirst()).numUpdatedRows,
    }));
    expect(r).toEqual({ upis: 0n, pravila: 0n, kolegij: 0n });
  });

  it("security definer funkcije odbijaju studenta", async () => {
    const poziv = (q: ReturnType<typeof sql>) => greskaKod(o.kao(s.S1.korisnik, (tx) => q.execute(tx)));
    expect(await poziv(sql`select private.uvezi_studente(${s.K1}, '[]'::jsonb, now(), null)`)).toBe("42501");
    expect(await poziv(sql`select private.uvoz_pripremi(${s.K1}, '{}'::text[], '{}'::text[])`)).toBe("42501");
    expect(await poziv(sql`select private.resetiraj_lozinku(${s.S2.student}, 'x')`)).toBe("42501");
    expect(await poziv(sql`select private.promijeni_grupu(gen_random_uuid(), ${s.G.V2}, now())`)).toBe("42501");
    expect(await poziv(sql`select private.nadji_osoblje('n@unipu.test')`)).toBe("42501");
    expect(await poziv(sql`select private.nadji_studenta_za_termin(${s.T.V2}, '0000000002')`)).toBe("42501");
    expect(await poziv(sql`select private.postavi_grupu(gen_random_uuid(), ${s.G.V2}, now())`)).toBe("42501");
  });
});

describe("bez RLS konteksta", () => {
  it("svaka tablica vraća 0 redova", async () => {
      const tablice = [
  "student",
  "upis",
  "clanstvo_grupe",
  "dolazak",
  "termin",
  "grupa",
  "kolegij",
  "osoblje",
  "korisnik",
  "pravila_prolaza",
  "v_dolaznost",
  "predaja",
  "predaja_verzija",
  "predaja_datoteka",
  "povratna_informacija",
  "datoteka",
  "produzenje_roka",
  "v_predaja",
  "v_predaja_verzija",
] as const;
    const r = await o.bezKonteksta(async (tx) =>
      Object.fromEntries(await Promise.all(tablice.map(async (t) => [t, Number((await sql<{ n: string }>`select count(*) as n from ${sql.table(t)}`.execute(tx)).rows[0].n)]))),
    );
    expect(Object.values(r).every((n) => n === 0)).toBe(true);
  });
});