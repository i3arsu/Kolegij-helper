import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { greskaKod, novoOkruzenje, type Okruzenje } from "./pomocnici";

import { postaviScenuAnalitika } from "./scena-analitika";

type ScenaAnalitika = Awaited<ReturnType<typeof postaviScenuAnalitika>>;

const DAN = 24 * 60 * 60 * 1000;

let o: Okruzenje;
let s: ScenaAnalitika;

beforeAll(async () => {
  o = await novoOkruzenje();
  s = await postaviScenuAnalitika(o);
});

afterAll(async () => {
  await o.zatvori();
});

// Cada test comienza con las mismas reglas y plazos.
// Así evitamos dependencias entre escenarios.
beforeEach(async () => {
  await o.vlasnik
    .updateTable("pravila_prolaza")
    .set({
      min_bodova: 7,
      planirano_bodova: null,
    })
    .where("kolegij_id", "=", s.K1)
    .execute();

  const rokBudući = new Date(Date.now() + 7 * DAN);

  await postaviRokDorade(s.predaje.vracenaBezKasne, rokBudući);

  await postaviRokDorade(s.predaje.vracenaSKasnom, rokBudući);

  await postaviRokDorade(s.predaje.vracenaBezRoka, null);
});

async function postaviRokDorade(predajaId: string, rokDorade: Date | null) {
  const rezultat = await o.vlasnik
    .updateTable("povratna_informacija")
    .set({ rok_dorade: rokDorade })
    .where("predaja_id", "=", predajaId)
    .where("verzija_broj", "=", 1)
    .executeTakeFirst();

  if (Number(rezultat.numUpdatedRows) !== 1) {
    throw new Error(`Nije ažuriran rok dorade za predaju ${predajaId}.`);
  }
}

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
        .select(["kolegij_id", "student_id", "tip", "status"])
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

      expect(redovi.filter((r) => r.status === "prisutan").length).toBe(
        Number(ukupno.prisutan),
      );

      expect(redovi.filter((r) => r.status === "opravdano").length).toBe(
        Number(ukupno.opravdano),
      );

      expect(redovi.filter((r) => r.status === "odsutan").length).toBe(
        Number(ukupno.odsutan),
      );
    }
  });
});

describe("v_bodovi", () => {
  it("razdvaja bodove prihvaćenih i privremenih predaja", async () => {
    const r = await bodoviStudenta(s.N.korisnik, s.K1, s.S1.student);

    expect(Number(r.prihvaceno)).toBe(7);
    expect(Number(r.privremeno)).toBe(24);
    expect(Number(r.max_objavljeno)).toBe(90);
    expect(Number(r.izgubljeno)).toBe(13);
  });

  it("vraća nule studentu bez dodijeljenih zadataka", async () => {
    const r = await bodoviStudenta(s.N.korisnik, s.K1, s.S2.student);

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

    const r = await bodoviStudenta(s.N.korisnik, s.K1, s.S1.student);

    // 60 planiranih - 13 izgubljenih = 47.
    // 47 je manje od potrebnih 50.
    expect(r.rizik).toBe(true);
    expect(r.zadovoljava).toBe(false);
  });

  it("ne označava rizik kada planirani bodovi nisu postavljeni", async () => {
    const r = await bodoviStudenta(s.N.korisnik, s.K1, s.S1.student);

    expect(r.rizik).toBe(false);
  });

  it("odbija planirane bodove ispod minimalnog praga", async () => {
    const kod = await greskaKod(
      o.vlasnik
        .updateTable("pravila_prolaza")
        .set({
          min_bodova: 50,
          planirano_bodova: 49,
        })
        .where("kolegij_id", "=", s.K1)
        .execute(),
    );

    expect(kod).toBe("23514");
  });

  it("gubi sve bodove zbog isteka roka dorade bez kasnih predaja", async () => {
    await postaviRokDorade(
      s.predaje.vracenaBezKasne,
      new Date(Date.now() - 60_000),
    );

    const r = await bodoviStudenta(s.N.korisnik, s.K1, s.S1.student);

    // 13 prethodno izgubljenih + 10 poradi istekle revizije.
    expect(Number(r.izgubljeno)).toBe(23);

    // Četiri privremena boda nisu se računala u prihvaćene bodove.
    // Ne smiju se dodatno oduzimati.
    expect(Number(r.privremeno)).toBe(24);
    expect(Number(r.prihvaceno)).toBe(7);
  });

  it("ne gubi bodove zbog istekle revizije kada su kasne predaje dopuštene", async () => {
    await postaviRokDorade(
      s.predaje.vracenaSKasnom,
      new Date(Date.now() - 60_000),
    );

    const r = await bodoviStudenta(s.N.korisnik, s.K1, s.S1.student);

    expect(Number(r.izgubljeno)).toBe(13);
    expect(Number(r.privremeno)).toBe(24);
  });

  it("ne gubi bodove kada je rok dorade još u budućnosti", async () => {
    const r = await bodoviStudenta(s.N.korisnik, s.K1, s.S1.student);

    expect(Number(r.izgubljeno)).toBe(13);
    expect(Number(r.privremeno)).toBe(24);
  });

  it("ne gubi bodove kada povratna informacija nema rok dorade", async () => {
    const r = await bodoviStudenta(s.N.korisnik, s.K1, s.S1.student);

    expect(Number(r.izgubljeno)).toBe(13);
    expect(Number(r.privremeno)).toBe(24);
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
