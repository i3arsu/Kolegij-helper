import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { postotakDolaznosti, type NacinOpravdanog } from "@/lib/domena/dolaznost";
import { lokalnoUTrenutak } from "@/lib/domena/vrijeme";
import { novoOkruzenje, type Okruzenje } from "./pomocnici";
import { postaviScenu, type Scena } from "./scena";

let o: Okruzenje;
let s: Scena;
beforeAll(async () => {
  o = await novoOkruzenje();
  s = await postaviScenu(o.vlasnik);
  // Dodatni termini V1: prisutan, opravdano, odsutan (bez reda), otkazan, neevidentiran, gost S2.
  const t = async (datum: string, dodatno: { otkazan?: boolean; evidentiran?: boolean } = {}) =>
    (await o.vlasnik.insertInto("termin").values({
      kolegij_id: s.K1, grupa_id: s.G.V1, pocetak: lokalnoUTrenutak(datum, "10:00"), kraj: lokalnoUTrenutak(datum, "11:00"),
      otkazan: dodatno.otkazan ?? false, evidencija_spremljena_at: dodatno.evidentiran === false ? null : new Date(),
    }).returning("id").executeTakeFirstOrThrow()).id;
  const t2 = await t("2026-09-15");
  const t3 = await t("2026-09-22");
  await t("2026-09-29"); // evidentiran, S1 nema reda -> odsutan
  const t5 = await t("2026-10-06", { otkazan: true });
  await t("2026-10-13", { evidentiran: false });
  await o.vlasnik.insertInto("dolazak").values([
    { termin_id: t2, student_id: s.S1.student, status: "opravdano" },
    { termin_id: t3, student_id: s.S1.student, status: "prisutan" },
    { termin_id: t5, student_id: s.S1.student, status: "prisutan" },
    { termin_id: t3, student_id: s.S2.student, status: "prisutan", gost: true },
  ]).execute();
});
afterAll(async () => o.zatvori());

const dolaznostV = async (student: string) =>
  o.kao(s.N.korisnik, (tx) =>
    tx.selectFrom("v_dolaznost").selectAll().where("student_id", "=", student).where("tip", "=", "vjezbe").executeTakeFirst());

describe("v_dolaznost", () => {
  // S1 na V1: održano 4 (8.9., 15.9., 22.9., 29.9.), prisutan 2, opravdano 1, odsutan 1; otkazani i neevidentirani se ne broje.
  it.each([
    ["izuzeto", 66.7],
    ["kao_prisutan", 75],
    ["kao_odsutan", 50],
  ] as [NacinOpravdanog, number][])("opravdano %s → %d %%", async (nacin, ocekivano) => {
    await o.vlasnik.updateTable("pravila_prolaza").set({ opravdano_se_racuna: nacin }).where("kolegij_id", "=", s.K1).execute();
    const d = await dolaznostV(s.S1.student);
    expect(d).toMatchObject({ odrzano: 4, prisutan: 2, opravdano: 1, odsutan: 1 });
    expect(Number(d!.postotak)).toBe(ocekivano);
    expect(postotakDolaznosti({ odrzano: 4, prisutan: 2, opravdano: 1 }, nacin)).toBe(ocekivano);
  });

  it("gostujući dolazak ne ulazi u postotak druge grupe", async () => {
    const d = await dolaznostV(s.S2.student);
    expect(d).toMatchObject({ odrzano: 1, opravdano: 1 }); // samo vlastiti V2 termin
  });

  it("nakon promjene grupe broje se termini obje grupe unutar raspona članstva", async () => {
    // S2 prelazi iz V2 u V1 od 20.9.: V2 termin 8.9. + V1 termini 22.9. i 29.9.
    await o.kao(s.N.korisnik, async (tx) => {
      const upis = await tx.selectFrom("upis").select("id").where("student_id", "=", s.S2.student).executeTakeFirstOrThrow();
      await sql`select private.promijeni_grupu(${upis.id}, ${s.G.V1}, ${lokalnoUTrenutak("2026-09-20", "00:00")})`.execute(tx);
    });
    const d = await dolaznostV(s.S2.student);
    expect(d).toMatchObject({ odrzano: 3, opravdano: 1 });
  });
});
