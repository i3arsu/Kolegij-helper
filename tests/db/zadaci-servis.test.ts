
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  greskaKod,
  novoOkruzenje,
  type Okruzenje,
} from "./pomocnici";

import { postaviScenu, type Scena } from "./scena";
import {
  postaviScenuZadaci,
  type ScenaZadaci,
} from "./scena-zadaci";

import {
  kreirajZadatak,
  objaviZadatak,
  urediZadatak,
  zadaciKolegija,
  zadatakKolegija,
  type PodaciZadatka,
} from "@/lib/servisi/zadaci";

let o: Okruzenje;
let s: Scena;
let z: ScenaZadaci;

beforeAll(async () => {
  o = await novoOkruzenje();
  s = await postaviScenu(o.vlasnik);
  z = await postaviScenuZadaci(o.vlasnik, s);
});

afterAll(async () => {
  await o.zatvori();
});

function podaciZadatka(
  izmjene: Partial<PodaciZadatka> = {},
): PodaciZadatka {
  return {
    naslov: "Test servisa zadataka",
    opis: "Opis testnog zadatka",
    rok: new Date("2030-01-01T22:59:00.000Z"),
    max_bodova: 10,
    nacini_predaje: ["datoteka"],
    dopusti_kasnu_predaju: true,
    za_cijeli_kolegij: true,
    grupaIds: [],
    ...izmjene,
  };
}

describe("servis zadataka", () => {
  it("kreira skicu koju nastavnik može pronaći", async () => {
    const id = await o.kao(s.N.korisnik, (tx) =>
      kreirajZadatak(
        tx,
        s.K1,
        podaciZadatka(),
      ),
    );

    const zadatak = await o.kao(s.N.korisnik, (tx) =>
      zadatakKolegija(tx, s.K1, id),
    );

    expect(zadatak).not.toBeNull();
    expect(zadatak?.naslov).toBe("Test servisa zadataka");
    expect(zadatak?.objavljen_at).toBeNull();
    expect(zadatak?.za_cijeli_kolegij).toBe(true);
  });

  it("vraća grupne zadatke s pripadajućim grupama", async () => {
    const id = await o.kao(s.N.korisnik, (tx) =>
      kreirajZadatak(
        tx,
        s.K1,
        podaciZadatka({
          naslov: "Test zadatka grupe",
          za_cijeli_kolegij: false,
          grupaIds: [s.G.V1],
        }),
      ),
    );

    const zadatak = await o.kao(s.N.korisnik, (tx) =>
      zadatakKolegija(tx, s.K1, id),
    );

    expect(zadatak?.grupe.map((g) => g.id)).toEqual([
      s.G.V1,
    ]);
  });

  it("odbija povezivanje grupe drugog kolegija", async () => {
    await expect(
      o.kao(s.N.korisnik, (tx) =>
        kreirajZadatak(
          tx,
          s.K1,
          podaciZadatka({
            naslov: "Neispravna grupa",
            za_cijeli_kolegij: false,
            grupaIds: [s.GK2],
          }),
        ),
      ),
    ).rejects.toMatchObject({
      kljuc: "invalidAssignmentGroups",
    });
  });

  it("uređuje skicu bez automatske objave", async () => {
    const id = await o.kao(s.N.korisnik, (tx) =>
      kreirajZadatak(
        tx,
        s.K1,
        podaciZadatka({
          naslov: "Stari naslov",
        }),
      ),
    );

    await o.kao(s.N.korisnik, (tx) =>
      urediZadatak(
        tx,
        s.K1,
        id,
        podaciZadatka({
          naslov: "Novi naslov",
          opis: "Izmijenjeni opis",
          max_bodova: 20,
        }),
      ),
    );

    const zadatak = await o.kao(s.N.korisnik, (tx) =>
      zadatakKolegija(tx, s.K1, id),
    );

    expect(zadatak?.naslov).toBe("Novi naslov");
    expect(zadatak?.opis).toBe("Izmijenjeni opis");
    expect(Number(zadatak?.max_bodova)).toBe(20);
    expect(zadatak?.objavljen_at).toBeNull();
  });

  it("objavljuje skicu i odbija ponovnu objavu", async () => {
    const id = await o.kao(s.N.korisnik, (tx) =>
      kreirajZadatak(
        tx,
        s.K1,
        podaciZadatka({
          naslov: "Zadatak za objavu",
        }),
      ),
    );

    await o.kao(s.N.korisnik, (tx) =>
      objaviZadatak(tx, s.K1, id),
    );

    const zadatak = await o.kao(s.N.korisnik, (tx) =>
      zadatakKolegija(tx, s.K1, id),
    );

    expect(zadatak?.objavljen_at).not.toBeNull();

    await expect(
      o.kao(s.N.korisnik, (tx) =>
        objaviZadatak(tx, s.K1, id),
      ),
    ).rejects.toMatchObject({
      kljuc: "assignmentAlreadyPublished",
    });
  });

  it("lista zadataka uključujući skice i brojače", async () => {
    const redovi = await o.kao(s.N.korisnik, (tx) =>
      zadaciKolegija(tx, s.K1),
    );

    expect(
      redovi.some((r) => r.id === z.Z.skica),
    ).toBe(true);

    const skica = redovi.find((r) => r.id === z.Z.skica);

    expect(skica?.objavljen_at).toBeNull();
    expect(skica?.grupe).toEqual([]);
    expect(skica?.nije_predano).toBeGreaterThanOrEqual(0);
    expect(skica?.predano).toBeGreaterThanOrEqual(0);
    expect(skica?.u_pregledu).toBeGreaterThanOrEqual(0);
    expect(skica?.vraceno_na_doradu).toBeGreaterThanOrEqual(0);
    expect(skica?.prihvaceno).toBeGreaterThanOrEqual(0);
  });

  it("asistent ne može kreirati zadatke", async () => {
    const kod = await greskaKod(
      o.kao(s.A.korisnik, (tx) =>
        kreirajZadatak(
          tx,
          s.K1,
          podaciZadatka({
            naslov: "Zabranjen zadatak",
          }),
        ),
      ),
    );

    expect(kod).toBe("42501");
  });
});
