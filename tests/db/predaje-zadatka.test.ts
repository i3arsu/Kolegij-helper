
import {
  afterAll,
  beforeAll,
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
  predajeZadatka,
} from "@/lib/servisi/predaje-zadatka";

let o: Okruzenje;
let s: Scena;

let brojac = 0;

beforeAll(async () => {
  o = await novoOkruzenje();
  s = await postaviScenu(o.vlasnik);
});

afterAll(async () => {
  await o.zatvori();
});

type OpcijeZadatka = {
  kolegijId?: string;
  grupaIds?: string[];
  zaCijeliKolegij?: boolean;
  rok?: Date;
  dopustiKasnu?: boolean;
};

async function noviZadatak(
  opcije: OpcijeZadatka = {},
) {
  brojac++;

  const kolegijId = opcije.kolegijId ?? s.K1;

  const zadatak = await o.vlasnik
    .insertInto("zadatak")
    .values({
      kolegij_id: kolegijId,
      naslov: `Test predaja ${brojac}`,
      opis: "",
      rok:
        opcije.rok ??
        new Date("2030-01-01T22:59:00.000Z"),
      max_bodova: 10,
      nacini_predaje: ["datoteka", "link", "tekst"],
      dopusti_kasnu_predaju:
        opcije.dopustiKasnu ?? true,
      za_cijeli_kolegij:
        opcije.zaCijeliKolegij ?? true,
      objavljen_at: new Date("2026-10-01T00:00:00.000Z"),
      created_by:
        kolegijId === s.K2
          ? s.N2.korisnik
          : s.N.korisnik,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  if (opcije.grupaIds?.length) {
    await o.vlasnik
      .insertInto("zadatak_grupa")
      .values(
        opcije.grupaIds.map((grupa_id) => ({
          zadatak_id: zadatak.id,
          grupa_id,
        })),
      )
      .execute();
  }

  return zadatak.id;
}

async function predaj(
  korisnikId: string,
  zadatakId: string,
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
        ${"Sadržaj testne predaje"}::text,
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

describe("predajeZadatka", () => {
  it("nastavnik vidi sve dodijeljene studente, uključujući one koji nisu predali", async () => {
    const zadatakId = await noviZadatak();

    const redovi = await o.kao(
      s.N.korisnik,
      (tx) => predajeZadatka(tx, s.K1, zadatakId),
    );

    expect(
      redovi.map((r) => r.student_id),
    ).toEqual([s.S1.student, s.S2.student]);

    expect(
      redovi.every((r) => r.status === "nije_predano"),
    ).toBe(true);

    expect(
      redovi.every((r) => r.predaja_id === null),
    ).toBe(true);

    expect(
      redovi.every((r) => r.trenutna_verzija === 0),
    ).toBe(true);
  });

  it("prikazuje trenutne grupe svakog studenta", async () => {
    const zadatakId = await noviZadatak();

    const redovi = await o.kao(
      s.N.korisnik,
      (tx) => predajeZadatka(tx, s.K1, zadatakId),
    );

    const s1 = redovi.find(
      (r) => r.student_id === s.S1.student,
    );

    const s2 = redovi.find(
      (r) => r.student_id === s.S2.student,
    );

    expect(
      s1?.grupe.map((g) => g.id).sort(),
    ).toEqual([s.G.P1, s.G.V1].sort());

    expect(
      s2?.grupe.map((g) => g.id).sort(),
    ).toEqual([s.G.P1, s.G.V2].sort());
  });

  it("za zadatak namijenjen grupi V1 ne uključuje studenta iz V2", async () => {
    const zadatakId = await noviZadatak({
      zaCijeliKolegij: false,
      grupaIds: [s.G.V1],
    });

    const redovi = await o.kao(
      s.N.korisnik,
      (tx) => predajeZadatka(tx, s.K1, zadatakId),
    );

    expect(
      redovi.map((r) => r.student_id),
    ).toEqual([s.S1.student]);
  });

  it("asistent vidi samo studente koje dopuštaju postojeće politike RLS", async () => {
    const zadatakId = await noviZadatak();

    const redovi = await o.kao(
      s.A.korisnik,
      (tx) => predajeZadatka(tx, s.K1, zadatakId),
    );

    expect(
      redovi.map((r) => r.student_id),
    ).toEqual([s.S1.student]);

    expect(
      redovi.some((r) => r.student_id === s.S2.student),
    ).toBe(false);
  });

  it("prikazuje predaju, vrijeme predaje i zakašnjenje", async () => {
    const zadatakId = await noviZadatak({
      rok: new Date("2020-01-01T00:00:00.000Z"),
      dopustiKasnu: true,
    });

    const rezultat = await predaj(
      s.S1.korisnik,
      zadatakId,
    );

    const redovi = await o.kao(
      s.N.korisnik,
      (tx) => predajeZadatka(tx, s.K1, zadatakId),
    );

    const s1 = redovi.find(
      (r) => r.student_id === s.S1.student,
    );

    expect(s1?.predaja_id).toBe(rezultat.predaja_id);
    expect(s1?.status).toBe("predano");
    expect(s1?.trenutna_verzija).toBe(1);
    expect(s1?.predano_at).not.toBeNull();
    expect(s1?.kasni).toBe(true);
    expect(s1?.rok_prosao).toBe(true);
  });

  it("ne vraća zadatke drugog kolegija", async () => {
    const zadatakId = await noviZadatak({
      kolegijId: s.K2,
    });

    const redovi = await o.kao(
      s.N.korisnik,
      (tx) => predajeZadatka(tx, s.K1, zadatakId),
    );

    expect(redovi).toEqual([]);
  });
});