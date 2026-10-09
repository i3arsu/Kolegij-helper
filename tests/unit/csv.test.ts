import { describe, expect, it } from "vitest";
import { parsirajCsv } from "@/lib/csv/parsiraj";
import { validirajRedove } from "@/lib/csv/validiraj";
import { usporedi } from "@/lib/csv/usporedi";

const utf8 = (s: string) => new TextEncoder().encode(s);
const GRUPE = [{ naziv: "P1", tip: "predavanje" as const }, { naziv: "V1", tip: "vjezbe" as const }, { naziv: "V2", tip: "vjezbe" as const }];

describe("parsirajCsv", () => {
  it("UTF-8 s BOM-om, separator ;, hrvatska zaglavlja", () => {
    const r = parsirajCsv(utf8("﻿JMBAG;Prezime;Ime;E-mail;Grupa V\r\n0036512345;Đurić;Šime;sime@x.hr;V1\r\n"));
    expect(r.separator).toBe(";");
    expect(r.kodiranje).toBe("utf-8");
    expect(r.nedostajuciStupci).toEqual([]);
    expect(r.redovi[0]).toEqual({ redak: 2, jmbag: "0036512345", prezime: "Đurić", ime: "Šime", email: "sime@x.hr", grupa_v: "V1" });
  });

  it("Windows-1250 (Excel) i zarez kao separator", () => {
    // "Čolić,Žana" u Windows-1250: Č=0xC8, ć=0xE6, Ž=0x8E
    const bajtovi = new Uint8Array([
      ...utf8("JMBAG,Prezime,Ime,Email\n0036500001,"), 0xc8, ...utf8("oli"), 0xe6, ...utf8(","), 0x8e, ...utf8("ana,z@x.hr\n"),
    ]);
    const r = parsirajCsv(bajtovi);
    expect(r.kodiranje).toBe("windows-1250");
    expect(r.redovi[0]).toMatchObject({ prezime: "Čolić", ime: "Žana" });
  });

  it("javlja nedostajuće obavezne stupce", () => {
    expect(parsirajCsv(utf8("JMBAG;Ime\n1;2\n")).nedostajuciStupci).toEqual(["prezime", "email"]);
  });
});

describe("validirajRedove", () => {
  const red = (redak: number, jmbag: string, email: string, grupa_v = "V1") =>
    ({ redak, jmbag, ime: "A", prezime: "B", email, grupa_v });

  it("čuva vodeće nule i normalizira e-mail", () => {
    const { valjani } = validirajRedove([red(2, "0012345678", " Ana@X.HR ")], GRUPE);
    expect(valjani[0]).toMatchObject({ jmbag: "0012345678", email: "ana@x.hr", grupa_p: null, grupa_v: "V1" });
  });

  it("odbija neispravan JMBAG, e-mail i nepoznatu grupu", () => {
    const { valjani, greske } = validirajRedove([red(2, "123", "a@x.hr"), red(3, "0000000003", "nije-mail"), red(4, "0000000004", "c@x.hr", "V9")], GRUPE);
    expect(valjani).toEqual([]);
    expect(greske.map((g) => g.redak)).toEqual([2, 3, 4]);
    expect(greske[2].poruke[0]).toContain("V9");
  });

  it("duplikati JMBAG-a ili e-maila u datoteci označavaju sve pogođene retke", () => {
    const { valjani, greske } = validirajRedove(
      [red(2, "0000000001", "a@x.hr"), red(3, "0000000001", "b@x.hr"), red(4, "0000000004", "a@x.hr"), red(5, "0000000005", "e@x.hr")],
      GRUPE,
    );
    expect(valjani.map((v) => v.redak)).toEqual([5]);
    expect(greske.map((g) => g.redak)).toEqual([2, 3, 4]);
  });
});

describe("usporedi", () => {
  const r = (jmbag: string, email: string, grupa_v: string | null = "V1") =>
    ({ redak: 2, jmbag, ime: "Ana", prezime: "B", email, grupa_p: "P1", grupa_v });
  const postojeci = { jmbag: "0000000001", ime: "Ana", prezime: "B", email: "a@x.hr", upis_status: "aktivan" as const, grupa_p: "P1", grupa_v: "V1" };

  it("razvrstava nove, nepromijenjene, izmijenjene, konflikte i one kojih nema u datoteci", () => {
    const p = usporedi(
      [r("0000000001", "a@x.hr"), r("0000000002", "novi@x.hr"), r("0000000003", "a@x.hr")],
      [postojeci, { ...postojeci, jmbag: "0000000009", upis_status: "aktivan" }],
      [{ email: "a@x.hr", jmbag: "0000000001" }],
      [{ jmbag: "0000000001", ime: "Ana", prezime: "B" }, { jmbag: "0000000009", ime: "X", prezime: "Y" }],
    );
    expect(p.stavke.map((s) => s.vrsta)).toEqual(["nepromijenjen", "novi", "konflikt"]);
    expect(p.nisuUDatoteci.map((s) => s.jmbag)).toEqual(["0000000009"]);
  });

  it("promjena grupe i ponovni upis", () => {
    const p = usporedi([r("0000000001", "a@x.hr", "V2")], [{ ...postojeci, upis_status: "ispisan" }], [{ email: "a@x.hr", jmbag: "0000000001" }], []);
    expect(p.stavke[0]).toMatchObject({ vrsta: "izmijenjen", promjenaGrupe: true, ponovniUpis: true });
  });

  it("prazna grupa u datoteci ne mijenja postojeće članstvo", () => {
    const p = usporedi([r("0000000001", "a@x.hr", null)], [postojeci], [{ email: "a@x.hr", jmbag: "0000000001" }], []);
    expect(p.stavke[0].vrsta).toBe("nepromijenjen");
  });
});
