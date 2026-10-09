import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { izvrsiUvoz } from "@/lib/servisi/uvoz";
import type { RedUvoza } from "@/lib/csv/validiraj";
import { greskaKod, novoOkruzenje, type Okruzenje } from "./pomocnici";
import { postaviScenu, type Scena } from "./scena";

let o: Okruzenje;
let s: Scena;
beforeAll(async () => {
  o = await novoOkruzenje();
  s = await postaviScenu(o.vlasnik);
});
afterAll(async () => o.zatvori());

const red = (jmbag: string, ime: string, email: string, grupa_v: string | null = "V1"): RedUvoza => ({
  redak: 2, jmbag, ime, prezime: "Testić", email, grupa_p: "P1", grupa_v,
});
const uvezi = (redovi: RedUvoza[], datum = new Date("2026-10-01T00:00:00Z"), kao = s.N.korisnik) =>
  o.kao(kao, (tx) => izvrsiUvoz(tx, s.K1, redovi, datum, "test.csv"));

const clanstva = async (jmbag: string) =>
  (await sql<{ naziv: string; otvoreno: boolean }>`
    select g.naziv, upper_inf(cg.vrijedi) as otvoreno from clanstvo_grupe cg
    join grupa g on g.id = cg.grupa_id join upis u on u.id = cg.upis_id join student st on st.id = u.student_id
    where st.jmbag = ${jmbag} and cg.tip = 'vjezbe' order by lower(cg.vrijedi) nulls first`.execute(o.vlasnik)).rows;

describe("CSV uvoz", () => {
  it("novi studenti dobivaju račun s lozinkom koja se vraća samo jednom", async () => {
    const r = await uvezi([red("1000000001", "Ana", "ana.t@student.unipu.test"), red("1000000002", "Bruno", "bruno.t@student.unipu.test", "V2")]);
    expect(r.novi).toBe(2);
    expect(r.pristupniPodaci).toHaveLength(2);
    expect(r.pristupniPodaci[0].lozinka).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    const k = await o.vlasnik.selectFrom("korisnik").select(["lozinka_hash", "mora_promijeniti_lozinku"])
      .where("email", "=", "ana.t@student.unipu.test").executeTakeFirstOrThrow();
    expect(k.lozinka_hash.startsWith("$argon2id$")).toBe(true);
    expect(k.lozinka_hash).not.toContain(r.pristupniPodaci[0].lozinka);
    expect(k.mora_promijeniti_lozinku).toBe(true);
  });

  it("ponovni uvoz iste datoteke ne mijenja ništa i ne generira lozinke", async () => {
    const r = await uvezi([red("1000000001", "Ana", "ana.t@student.unipu.test"), red("1000000002", "Bruno", "bruno.t@student.unipu.test", "V2")]);
    expect(r).toMatchObject({ novi: 0, izmijenjeni: 0, nepromijenjeni: 2 });
    expect(r.pristupniPodaci).toEqual([]);
  });

  it("promjena imena i grupe ažurira, a staro članstvo zatvara na datum promjene", async () => {
    const r = await uvezi([red("1000000001", "Ana Marija", "ana.t@student.unipu.test", "V2")], new Date("2026-10-05T00:00:00Z"));
    expect(r).toMatchObject({ izmijenjeni: 1, promjene_grupe: 1 });
    expect(await clanstva("1000000001")).toEqual([{ naziv: "V1", otvoreno: false }, { naziv: "V2", otvoreno: true }]);
  });

  it("studenti kojih nema u datoteci ostaju upisani (ništa se ne briše)", async () => {
    const n = await o.vlasnik.selectFrom("upis as u").innerJoin("student as st", "st.id", "u.student_id")
      .select("u.status").where("st.jmbag", "=", "1000000002").executeTakeFirstOrThrow();
    expect(n.status).toBe("aktivan");
  });

  it("e-mail koji pripada drugom korisniku je greška i ništa se ne uvozi", async () => {
    const kod = await greskaKod(uvezi([red("1000000003", "Cvita", "ana.t@student.unipu.test")]));
    expect(kod).toBe("P0001");
    const ima = await o.vlasnik.selectFrom("student").select("id").where("jmbag", "=", "1000000003").executeTakeFirst();
    expect(ima).toBeUndefined();
  });

  it("student s drugog kolegija upisuje se bez novog računa", async () => {
    const r = await uvezi([red("0000000003", "Stu", "s3@student.unipu.test")]);
    expect(r).toMatchObject({ novi: 0, upisani_postojeci: 1 });
    expect(r.pristupniPodaci).toEqual([]);
  });

  it("ispisani student se ponovnim uvozom vraća u aktivne", async () => {
    await o.vlasnik.updateTable("upis").set({ status: "ispisan" })
      .where("student_id", "=", (eb) => eb.selectFrom("student").select("id").where("jmbag", "=", "1000000002")).execute();
    const r = await uvezi([red("1000000002", "Bruno", "bruno.t@student.unipu.test", "V2")]);
    expect(r.ponovno_upisani).toBe(1);
  });

  it("nepoznata grupa poništava cijeli uvoz", async () => {
    expect(await greskaKod(uvezi([red("1000000009", "Dino", "dino.t@student.unipu.test", "V9")]))).toBe("P0001");
  });

  it("asistent ne može uvoziti", async () => {
    expect(await greskaKod(uvezi([red("1000000010", "Eva", "eva.t@student.unipu.test")], undefined, s.A.korisnik))).toBe("42501");
  });
});
