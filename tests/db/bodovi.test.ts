
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  novoOkruzenje,
  type Okruzenje,
} from "./pomocnici";

import { postaviScenuAnalitika } from "./scena-analitika";

type ScenaAnalitika = Awaited<
  ReturnType<typeof postaviScenuAnalitika>
>;

let o: Okruzenje;
let s: ScenaAnalitika;

beforeAll(async () => {
  o = await novoOkruzenje();
  s = await postaviScenuAnalitika(o);
});

afterAll(async () => {
  await o.zatvori();
});

async function bodoviStudenta(
  korisnikId: string,
  kolegijId: string,
  studentId: string,
) {
  return o.kao(korisnikId, (tx) =>
    tx
      .selectFrom("v_bodovi")
      .selectAll()
      .where("kolegij_id", "=", kolegijId)
      .where("student_id", "=", studentId)
      .executeTakeFirstOrThrow(),
  );
}

describe("v_dolazak_studenta", () => {
  it("broji iste sesije i statuse kao v_dolaznost", async () => {
    const rezultat = await o.kao(s.N.korisnik, async (tx) => ({
      pojedinacni: await tx
        .selectFrom("v_dolazak_studenta")
        .select([
          "kolegij_id",
          "student_id",
          "tip",
          "status",
        ])
        .execute(),

      ukupni: await tx
        .selectFrom("v_dolaznost")
        .select([
          "kolegij_id",
          "student_id",
          "tip",
          "odrzano",
          "prisutan",
          "opravdano",
          "odsutan",
        ])
        .execute(),
    }));

    for (const ukupno of rezultat.ukupni) {
      const redovi = rezultat.pojedinacni.filter(
        (r) =>
          r.kolegij_id === ukupno.kolegij_id &&
          r.student_id === ukupno.student_id &&
          r.tip === ukupno.tip,
      );

      expect(redovi.length).toBe(Number(ukupno.odrzano));

      expect(
        redovi.filter((r) => r.status === "prisutan").length,
      ).toBe(Number(ukupno.prisutan));

      expect(
        redovi.filter((r) => r.status === "opravdano").length,
      ).toBe(Number(ukupno.opravdano));

      expect(
        redovi.filter((r) => r.status === "odsutan").length,
      ).toBe(Number(ukupno.odsutan));
    }
  });
});

describe("v_bodovi", () => {
  it("razdvaja bodove prihvaćenih i privremenih predaja", async () => {
    const r = await bodoviStudenta(
      s.N.korisnik,
      s.K1,
      s.S1.student,
    );

    expect(Number(r.prihvaceno)).toBe(7);
    expect(Number(r.privremeno)).toBe(12);
    expect(Number(r.max_objavljeno)).toBe(60);
    expect(Number(r.izgubljeno)).toBe(13);
  });

  it("vraća nule studentu bez dodijeljenih zadataka", async () => {
    const r = await bodoviStudenta(
      s.N.korisnik,
      s.K1,
      s.S2.student,
    );

    expect(Number(r.prihvaceno)).toBe(0);
    expect(Number(r.privremeno)).toBe(0);
    expect(Number(r.max_objavljeno)).toBe(0);
    expect(Number(r.izgubljeno)).toBe(0);
  });

  it("računa rizik prema planiranim i izgubljenim bodovima", async () => {
    await o.vlasnik
      .updateTable("pravila_prolaza")
      .set({
        min_bodova: 50,
        planirano_bodova: 60,
      })
      .where("kolegij_id", "=", s.K1)
      .execute();

    const r = await bodoviStudenta(
      s.N.korisnik,
      s.K1,
      s.S1.student,
    );

    // 60 planiranih - 13 izgubljenih = 47.
    // 47 je manje od potrebnih 50.
    expect(r.rizik).toBe(true);
    expect(r.zadovoljava).toBe(false);
  });

  it("ne označava rizik kada planirani bodovi nisu postavljeni", async () => {
    await o.vlasnik
      .updateTable("pravila_prolaza")
      .set({
        planirano_bodova: null,
      })
      .where("kolegij_id", "=", s.K1)
      .execute();

    const r = await bodoviStudenta(
      s.N.korisnik,
      s.K1,
      s.S1.student,
    );

    expect(r.rizik).toBe(false);
  });
});

describe("v_prolaz", () => {
  it("vraća true kada su ispunjeni svi pragovi", async () => {
    await o.vlasnik
      .updateTable("pravila_prolaza")
      .set({ min_bodova: 7 })
      .where("kolegij_id", "=", s.K1)
      .execute();

    const r = await o.kao(s.N.korisnik, (tx) =>
      tx
        .selectFrom("v_prolaz")
        .selectAll()
        .where("kolegij_id", "=", s.K1)
        .where("student_id", "=", s.S1.student)
        .executeTakeFirstOrThrow(),
    );

    expect(r.dolaznost_p_ok).toBe(true);
    expect(r.dolaznost_v_ok).toBe(true);
    expect(r.bodovi_ok).toBe(true);
    expect(r.zadovoljava).toBe(true);
  });

  it("vraća false kada nije dosegnut minimum bodova", async () => {
    await o.vlasnik
      .updateTable("pravila_prolaza")
      .set({ min_bodova: 8 })
      .where("kolegij_id", "=", s.K1)
      .execute();

    const r = await o.kao(s.N.korisnik, (tx) =>
      tx
        .selectFrom("v_prolaz")
        .selectAll()
        .where("kolegij_id", "=", s.K1)
        .where("student_id", "=", s.S1.student)
        .executeTakeFirstOrThrow(),
    );

    expect(r.dolaznost_p_ok).toBe(true);
    expect(r.dolaznost_v_ok).toBe(true);
    expect(r.bodovi_ok).toBe(false);
    expect(r.zadovoljava).toBe(false);
  });

  it("vraća null kada nema dovoljno podataka o dolaznosti", async () => {
    const r = await o.kao(s.N2.korisnik, (tx) =>
      tx
        .selectFrom("v_prolaz")
        .selectAll()
        .where("kolegij_id", "=", s.K2)
        .where("student_id", "=", s.S3.student)
        .executeTakeFirstOrThrow(),
    );

    expect(r.dolaznost_p_ok).toBeNull();
    expect(r.dolaznost_v_ok).toBeNull();
    expect(r.bodovi_ok).toBe(true);
    expect(r.zadovoljava).toBeNull();
  });
});