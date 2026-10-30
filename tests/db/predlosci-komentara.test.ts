
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novoOkruzenje, type Okruzenje } from "./pomocnici";
import { postaviScenu, type Scena } from "./scena";
import {
  kreirajPredlozakKomentara,
  predlosciKomentara,
  ukloniPredlozakKomentara,
  urediPredlozakKomentara,
} from "@/lib/servisi/kolegij";

let o: Okruzenje;
let s: Scena;

beforeAll(async () => {
  o = await novoOkruzenje();
  s = await postaviScenu(o.vlasnik);
});

afterAll(async () => {
  await o.zatvori();
});

describe("predlošci komentara", () => {
  it("nastavnik može kreirati, pročitati, urediti i obrisati predložak", async () => {
    const predlozak = await o.kao(s.N.korisnik, (tx) =>
      kreirajPredlozakKomentara(tx, s.K1, {
        naslov: "  Odličan rad  ",
        tekst: "  Nastavite ovako!  ",
      }),
    );

    const pocetni = await o.kao(s.N.korisnik, (tx) =>
      predlosciKomentara(tx, s.K1),
    );

    expect(pocetni).toContainEqual(
      expect.objectContaining({
        id: predlozak.id,
        kolegij_id: s.K1,
        naslov: "Odličan rad",
        tekst: "Nastavite ovako!",
      }),
    );

    await o.kao(s.N.korisnik, (tx) =>
      urediPredlozakKomentara(tx, s.K1, predlozak.id, {
        naslov: "Odličan napredak",
        tekst: "Vaš rad pokazuje veliki napredak.",
      }),
    );

    const uredeni = await o.kao(s.N.korisnik, (tx) =>
      predlosciKomentara(tx, s.K1),
    );

    expect(uredeni).toContainEqual(
      expect.objectContaining({
        id: predlozak.id,
        naslov: "Odličan napredak",
        tekst: "Vaš rad pokazuje veliki napredak.",
      }),
    );

    await o.kao(s.N.korisnik, (tx) =>
      ukloniPredlozakKomentara(tx, s.K1, predlozak.id),
    );

    const nakonBrisanja = await o.kao(s.N.korisnik, (tx) =>
      predlosciKomentara(tx, s.K1),
    );

    expect(nakonBrisanja).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: predlozak.id }),
      ]),
    );
  });

  it("asistent može čitati predloške, ali ih ne može stvarati, uređivati ni brisati", async () => {
    const predlozak = await o.kao(s.N.korisnik, (tx) =>
      kreirajPredlozakKomentara(tx, s.K1, {
        naslov: "Povratna informacija",
        tekst: "Dobro urađeno.",
      }),
    );

    const predlosci = await o.kao(s.A.korisnik, (tx) =>
      predlosciKomentara(tx, s.K1),
    );

    expect(predlosci).toContainEqual(
      expect.objectContaining({ id: predlozak.id }),
    );

    await expect(
      o.kao(s.A.korisnik, (tx) =>
        kreirajPredlozakKomentara(tx, s.K1, {
          naslov: "Nedopušten predložak",
          tekst: "Ovaj upis treba biti odbijen.",
        }),
      ),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      o.kao(s.A.korisnik, (tx) =>
        urediPredlozakKomentara(tx, s.K1, predlozak.id, {
          naslov: "Nedopuštena izmjena",
          tekst: "Izmijenjeni tekst.",
        }),
      ),
    ).rejects.toMatchObject({
      kljuc: "commentTemplateNotFound",
    });

    await expect(
      o.kao(s.A.korisnik, (tx) =>
        ukloniPredlozakKomentara(tx, s.K1, predlozak.id),
      ),
    ).rejects.toMatchObject({
      kljuc: "commentTemplateNotFound",
    });
  });

  it("student ne vidi predloške komentara", async () => {
  await o.kao(s.N.korisnik, (tx) =>
    kreirajPredlozakKomentara(tx, s.K1, {
      naslov: "Samo za osoblje",
      tekst: "Ovu predložak student ne bi trebao vidjeti.",
    }),
  );

  const predlosci = await o.kao(s.S1.korisnik, (tx) =>
    predlosciKomentara(tx, s.K1),
  );

  expect(predlosci).toEqual([]);
});


  it("nastavnik drugog kolegija ne može urediti predložak prvog kolegija", async () => {
    const predlozak = await o.kao(s.N.korisnik, (tx) =>
      kreirajPredlozakKomentara(tx, s.K1, {
        naslov: "Samo za K1",
        tekst: "Originalni tekst.",
      }),
    );

    await expect(
      o.kao(s.N2.korisnik, (tx) =>
        urediPredlozakKomentara(tx, s.K2, predlozak.id, {
          naslov: "Nedopuštena izmjena",
          tekst: "Izmijenjeni tekst.",
        }),
      ),
    ).rejects.toMatchObject({
      kljuc: "commentTemplateNotFound",
    });
  });
});