import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  novoOkruzenje,
  sql,
  type Okruzenje,
} from "./pomocnici";

import {
  postaviScenu,
  type Scena,
} from "./scena";

import {
  postaviScenuZadaci,
  type ScenaZadaci,
} from "./scena-zadaci";

import {
  zadaciStudenta,
  sljedeciRokoviStudenta,
  zadnjePovratneInformacije,
} from "@/lib/servisi/zadaci-studenta";

let o: Okruzenje;
let s: Scena;
let z: ScenaZadaci;

beforeEach(async () => {
  o = await novoOkruzenje();
  s = await postaviScenu(o.vlasnik);
  z = await postaviScenuZadaci(o.vlasnik, s);
});

afterEach(async () => {
  await o.zatvori();
});

type OdlukaDashboard =
  | "vraceno_na_doradu"
  | "prihvaceno";

async function predaj(
  korisnikId: string,
  zadatakId: string,
  tekst: string,
) {
  return o.kao(korisnikId, async (tx) => {
    const { rows } = await sql<{
      rezultat: {
        predaja_id: string;
        verzija: number;
      };
    }>`
      select private.predaj_zadatak(
        ${zadatakId}::uuid,
        ${tekst}::text,
        null::text,
        ${JSON.stringify([])}::jsonb
      ) as rezultat
    `.execute(tx);

    const rezultat = rows[0]?.rezultat;

    if (!rezultat) {
      throw new Error(
        "Funkcija predaj_zadatak nije vratila rezultat.",
      );
    }

    return rezultat;
  });
}

async function ocijeni(
  korisnikId: string,
  predajaId: string,
  odluka: OdlukaDashboard,
  komentar: string,
  bodovi: number | null,
  rokDorade: Date | null = null,
) {
  await o.kao(korisnikId, (tx) =>
    sql`
      select private.preuzmi_pregled(
        ${predajaId}::uuid
      )
    `.execute(tx),
  );

  await o.kao(korisnikId, (tx) =>
    sql`
      select private.ocijeni(
        ${predajaId}::uuid,
        ${odluka}::text,
        ${komentar}::text,
        ${bodovi}::numeric,
        ${rokDorade}::timestamptz
      )
    `.execute(tx),
  );
}

describe("zadaciStudenta", () => {
  it("student vidi samo objavljene zadatke koji su mu dodijeljeni", async () => {
    const redoviS1 = await o.kao(
      s.S1.korisnik,
      (tx) => zadaciStudenta(tx, s.K1, s.S1.student),
    );

    const redoviS2 = await o.kao(
      s.S2.korisnik,
      (tx) => zadaciStudenta(tx, s.K1, s.S2.student),
    );

    const idsS1 = new Set(redoviS1.map((r) => r.id));
    const idsS2 = new Set(redoviS2.map((r) => r.id));

    // S1 pripada grupi V1.
    expect(idsS1).toEqual(
      new Set([z.Z.cijeliKolegij, z.Z.samoV1]),
    );

    // S2 pripada grupi V2.
    expect(idsS2).toEqual(
      new Set([z.Z.cijeliKolegij]),
    );

    // Skice nisu vidljive studentima.
    expect(idsS1.has(z.Z.skica)).toBe(false);
    expect(idsS2.has(z.Z.skica)).toBe(false);
  });

  it("student zadržava pristup zadatku koji je predao prije promjene grupe", async () => {
    // Stvaramo objavljeni zadatak koji pripada samo grupi V1.
    const zadatak = await o.vlasnik
      .insertInto("zadatak")
      .values({
        kolegij_id: s.K1,
        naslov: "Predani zadatak V1",
        opis: "",
        rok: new Date("2030-01-01T22:59:00.000Z"),
        max_bodova: 10,
        nacini_predaje: ["tekst"],
        dopusti_kasnu_predaju: true,
        za_cijeli_kolegij: false,
        objavljen_at: new Date("2026-09-01T08:00:00.000Z"),
        created_by: s.N.korisnik,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await o.vlasnik
      .insertInto("zadatak_grupa")
      .values({
        zadatak_id: zadatak.id,
        grupa_id: s.G.V1,
      })
      .execute();

    // S1 predaje zadatak dok je još član grupe V1.
    await o.kao(s.S1.korisnik, async (tx) => {
      const { rows } = await sql<{
        rezultat: {
          predaja_id: string;
          verzija: number;
        };
      }>`
        select private.predaj_zadatak(
          ${zadatak.id}::uuid,
          ${"Prva verzija predaje"}::text,
          null::text,
          ${JSON.stringify([])}::jsonb
        ) as rezultat
      `.execute(tx);

      expect(rows[0]?.rezultat?.verzija).toBe(1);
    });

    // Dohvaćamo upis S1 na kolegij.
    const upis = await o.vlasnik
      .selectFrom("upis")
      .select("id")
      .where("kolegij_id", "=", s.K1)
      .where("student_id", "=", s.S1.student)
      .executeTakeFirstOrThrow();

    // Mijenjamo S1 iz grupe V1 u V2.
    await sql`
      select private.postavi_grupu(
        ${upis.id}::uuid,
        ${s.G.V2}::uuid,
        ${new Date("2026-10-15T00:00:00.000Z")}::timestamptz
      )
    `.execute(o.vlasnik);

    // Provjeravamo pristup nakon promjene grupe.
    const redoviS1 = await o.kao(
      s.S1.korisnik,
      (tx) => zadaciStudenta(tx, s.K1, s.S1.student),
    );

    const redoviS2 = await o.kao(
      s.S2.korisnik,
      (tx) => zadaciStudenta(tx, s.K1, s.S2.student),
    );

    const predaniZadatakS1 = redoviS1.find(
      (r) => r.id === zadatak.id,
    );

    expect(predaniZadatakS1).toBeDefined();
    expect(predaniZadatakS1?.status).toBe("predano");

    // S2 nije predao zadatak i pripada grupi V2.
    expect(
      redoviS2.some((r) => r.id === zadatak.id),
    ).toBe(false);
  });
});

describe("sljedeciRokoviStudenta", () => {
  it(
    "prikazuje samo buduće rokove dodijeljenih zadataka, kronološkim redom",
    async () => {
      const dan = 24 * 60 * 60 * 1000;

      const ranijiRok = new Date(Date.now() + 365 * dan);
      const kasnijiRok = new Date(Date.now() + 730 * dan);

      // Postavljamo različite rokove radi provjere redoslijeda.
      await o.vlasnik
        .updateTable("zadatak")
        .set({ rok: ranijiRok })
        .where("id", "=", z.Z.samoV1)
        .execute();

      await o.vlasnik
        .updateTable("zadatak")
        .set({ rok: kasnijiRok })
        .where("id", "=", z.Z.cijeliKolegij)
        .execute();

      const redoviS1 = await o.kao(
        s.S1.korisnik,
        (tx) =>
          sljedeciRokoviStudenta(tx, s.K1, s.S1.student),
      );

      const redoviS2 = await o.kao(
        s.S2.korisnik,
        (tx) =>
          sljedeciRokoviStudenta(tx, s.K1, s.S2.student),
      );

      // S1 pripada V1 i vidi oba zadatka.
      expect(
        redoviS1.map((r) => r.zadatak_id),
      ).toEqual([
        z.Z.samoV1,
        z.Z.cijeliKolegij,
      ]);

      // S2 pripada V2 i vidi samo zadatke cijelog kolegija.
      expect(
        redoviS2.map((r) => r.zadatak_id),
      ).toEqual([z.Z.cijeliKolegij]);

      expect(
        redoviS1[0]?.rok_za_predaju?.getTime(),
      ).toBe(ranijiRok.getTime());

      expect(
        redoviS1[1]?.rok_za_predaju?.getTime(),
      ).toBe(kasnijiRok.getTime());
    },
  );

  it(
    "ne prikazuje zadatke kojima je rok istekao",
    async () => {
      await o.vlasnik
        .updateTable("zadatak")
        .set({
          rok: new Date("2020-01-01T00:00:00.000Z"),
        })
        .where("id", "=", z.Z.cijeliKolegij)
        .execute();

      const redovi = await o.kao(
        s.S1.korisnik,
        (tx) =>
          sljedeciRokoviStudenta(tx, s.K1, s.S1.student),
      );

      expect(
        redovi.map((r) => r.zadatak_id),
      ).toEqual([z.Z.samoV1]);
    },
  );
  it(
    "koristi rok dorade umjesto izvornog roka zadatka",
    async () => {
        const zadatakId = z.Z.cijeliKolegij;

        // Omogućujemo predaju teksta.
        await o.vlasnik
        .updateTable("zadatak")
        .set({
            nacini_predaje: ["tekst"],
        })
        .where("id", "=", zadatakId)
        .execute();

        // Student predaje prvu verziju.
        const predaja = await predaj(
            s.S1.korisnik,
            zadatakId,
            "Prva verzija rada",
        );

        // Nastavnik vraća zadatak na doradu.
        const rokDorade = new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
        );

        await ocijeni(
            s.N.korisnik,
            predaja.predaja_id,
            "vraceno_na_doradu",
            "Potrebne su dodatne izmjene.",
            null,
            rokDorade,
        );

        // Student provjerava svoje nadolazeće rokove.
        const redovi = await o.kao(
        s.S1.korisnik,
        (tx) =>
            sljedeciRokoviStudenta(
                tx,
                s.K1,
                s.S1.student,
            ),
        );

        const zadatak = redovi.find(
            (red) => red.zadatak_id === zadatakId,
        );

        expect(zadatak).toBeDefined();
        expect(zadatak?.status).toBe("vraceno_na_doradu");

        // Mora se prikazati rok koji je odredio nastavnik.
        expect(zadatak?.rok_za_predaju?.getTime()).toBe(
                rokDorade.getTime(),
            );
        },
    );
});

describe("zadnjePovratneInformacije", () => {
  it(
    "prikazuje komentare, odluke, bodove i rokove dorade kronološki",
    async () => {
      const zadatakId = z.Z.cijeliKolegij;

      // La tarea debe aceptar texto para poder realizar la entrega.
      await o.vlasnik
        .updateTable("zadatak")
        .set({
          nacini_predaje: ["tekst"],
        })
        .where("id", "=", zadatakId)
        .execute();

      // Primera versión.
      const prva = await predaj(
        s.S1.korisnik,
        zadatakId,
        "Prva verzija rada",
      );

      // El docente devuelve la entrega para su corrección.
      const rokDorade = new Date(
        "2030-01-01T00:00:00.000Z",
      );

      await ocijeni(
        s.N.korisnik,
        prva.predaja_id,
        "vraceno_na_doradu",
        "Potrebne su dodatne izmjene.",
        null,
        rokDorade,
      );

      // Segunda versión.
      const druga = await predaj(
        s.S1.korisnik,
        zadatakId,
        "Druga verzija rada",
      );

      expect(druga.predaja_id).toBe(prva.predaja_id);
      expect(druga.verzija).toBe(2);

      // El docente acepta la segunda versión.
      await ocijeni(
        s.N.korisnik,
        prva.predaja_id,
        "prihvaceno",
        "Rad je uspješno završen.",
        9,
      );

      // El estudiante consulta sus últimas valoraciones.
      const redovi = await o.kao(
        s.S1.korisnik,
        (tx) =>
          zadnjePovratneInformacije(
            tx,
            s.K1,
            s.S1.student,
          ),
      );

      expect(redovi).toHaveLength(2);

      // La valoración más reciente debe aparecer primero.
      expect(
        redovi.map((red) => red.verzija),
      ).toEqual([2, 1]);

      // Segunda versión: aceptada.
      expect(redovi[0]?.odluka).toBe("prihvaceno");
      expect(redovi[0]?.komentar).toBe(
        "Rad je uspješno završen.",
      );
      expect(Number(redovi[0]?.bodovi)).toBe(9);
      expect(redovi[0]?.rok_dorade).toBeNull();

      // Primera versión: devuelta para corrección.
      expect(redovi[1]?.odluka).toBe(
        "vraceno_na_doradu",
      );
      expect(redovi[1]?.komentar).toBe(
        "Potrebne su dodatne izmjene.",
      );
      expect(redovi[1]?.rok_dorade?.getTime()).toBe(
        rokDorade.getTime(),
      );

      // Ambas valoraciones pertenecen al mismo trabajo.
      expect(
        redovi.every(
          (red) => red.zadatak_id === zadatakId,
        ),
      ).toBe(true);
    },
  );

  it(
    "ne prikazuje povratne informacije drugih studenata",
    async () => {
      const zadatakId = z.Z.cijeliKolegij;

      await o.vlasnik
        .updateTable("zadatak")
        .set({
          nacini_predaje: ["tekst"],
        })
        .where("id", "=", zadatakId)
        .execute();

      // S1 entrega su trabajo.
      const predajaS1 = await predaj(
        s.S1.korisnik,
        zadatakId,
        "Rad studenta S1",
      );

      await ocijeni(
        s.N.korisnik,
        predajaS1.predaja_id,
        "prihvaceno",
        "Povratna informacija S1",
        10,
      );

      // S2 entrega el mismo trabajo.
      const predajaS2 = await predaj(
        s.S2.korisnik,
        zadatakId,
        "Rad studenta S2",
      );

      await ocijeni(
        s.N.korisnik,
        predajaS2.predaja_id,
        "vraceno_na_doradu",
        "Povratna informacija S2",
        null,
        new Date("2030-01-01T00:00:00.000Z"),
      );

      // S1 no debe acceder a la valoración de S2.
      const povratneS1 = await o.kao(
        s.S1.korisnik,
        (tx) =>
          zadnjePovratneInformacije(
            tx,
            s.K1,
            s.S1.student,
          ),
      );

      expect(povratneS1).toHaveLength(1);
      expect(povratneS1[0]?.komentar).toBe(
        "Povratna informacija S1",
      );

      // S2 solamente debe acceder a su propia valoración.
      const povratneS2 = await o.kao(
        s.S2.korisnik,
        (tx) =>
          zadnjePovratneInformacije(
            tx,
            s.K1,
            s.S2.student,
          ),
      );

      expect(povratneS2).toHaveLength(1);
      expect(povratneS2[0]?.komentar).toBe(
        "Povratna informacija S2",
      );
    },
  );
});