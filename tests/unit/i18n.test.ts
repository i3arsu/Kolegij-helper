import { readdirSync, readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { validirajRedove } from "@/lib/csv/validiraj";
import { formatDatum, formatDatumDan } from "@/lib/domena/vrijeme";
import { GreskaAplikacije, porukaGreske } from "@/lib/http/greske";
import type { Prevoditelj } from "@/lib/i18n/prevoditelj";
import en from "@/messages/en.json";
import hr from "@/messages/hr.json";

const prevoditelj = (locale: "hr" | "en", messages: typeof hr, namespace: string): Prevoditelj => {
  const t = createTranslator({ locale, messages }) as unknown as Prevoditelj;
  return (kljuc, vrijednosti) => t(`${namespace}.${kljuc}`, vrijednosti);
};
const greskeEn = prevoditelj("en", en, "errors");
const greskeHr = prevoditelj("hr", hr, "errors");

describe("poruke", () => {
  const kljucevi = (o: object, put = ""): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? kljucevi(v, `${put}${k}.`) : [`${put}${k}`]));

  it("en.json ima iste ključeve kao hr.json i nijedan prazan tekst", () => {
    expect(kljucevi(en).sort()).toEqual(kljucevi(hr).sort());
    const prazni = kljucevi(en).filter((k) => k.split(".").reduce<unknown>((o, d) => (o as Record<string, unknown>)[d], en) === "");
    expect(prazni).toEqual([]);
  });
});

describe("porukaGreske", () => {
  it("prevodi greške servisa po ključu", () => {
    const e = new GreskaAplikacije("tooManySessions", { max: 40 });
    expect(porukaGreske(e, greskeHr)).toBe("Najviše 40 termina odjednom.");
    expect(porukaGreske(e, greskeEn)).toBe("At most 40 sessions at once.");
  });

  it("prepoznaje hrvatske poruke iz baze (P0001) i prevodi ih s parametrima", () => {
    const e = { code: "P0001", message: "E-mail ana@x.hr već koristi drugi korisnik" };
    expect(porukaGreske(e, greskeHr)).toBe("E-mail ana@x.hr već koristi drugi korisnik");
    expect(porukaGreske(e, greskeEn)).toBe("Email ana@x.hr is already used by another user");
    expect(porukaGreske({ code: "P0001", message: "Nepoznata poruka" }, greskeEn)).toBe("Nepoznata poruka");
  });

  it("svaka poruka P0001 iz migracija ima prijevod", () => {
    const sql = readdirSync("db/migrations").map((f) => readFileSync(`db/migrations/${f}`, "utf8")).join("\n");
    const poruke = [...sql.matchAll(/raise exception '([^']+)'[^;]*errcode = 'P0001'/g)]
      .map((m) => m[1].replaceAll("%", "X"))
      .filter((p) => !p.startsWith("NEDOSTAJE_LOZINKA")); // interna, ne prikazuje se
    expect(poruke.length).toBeGreaterThan(5);
    for (const p of poruke) {
      expect(porukaGreske({ code: "P0001", message: p }, greskeEn), p).not.toBe(p);
      expect(porukaGreske({ code: "P0001", message: p }, greskeHr), p).toBe(p);
    }
  });

  it("kodovi PostgreSQL-a", () => {
    expect(porukaGreske({ code: "42501" }, greskeEn)).toBe(en.errors.forbidden);
    expect(porukaGreske({ code: "23P01", constraint: "clanstvo_bez_preklapanja" }, greskeEn)).toBe(en.errors.twoGroups);
  });
});

describe("CSV validacija na engleskom", () => {
  it("poruke iz import.validation", () => {
    const t = prevoditelj("en", en, "import.validation");
    const { greske } = validirajRedove(
      [
        { redak: 2, jmbag: "123", ime: "A", prezime: "B", email: "a@x.hr" },
        { redak: 3, jmbag: "0000000003", ime: "A", prezime: "B", email: "c@x.hr", grupa_v: "V9" },
      ],
      [],
      t,
    );
    expect(greske[0].poruke[0]).toBe(en.import.validation.jmbagDigits);
    expect(greske[1].poruke[0]).toBe("Unknown exercise group “V9”");
  });
});

describe("datumi", () => {
  const t = new Date("2026-10-19T08:00:00Z");
  it("hrvatski i engleski format", () => {
    expect(formatDatum(t, "hr")).toBe("19. 10. 2026.");
    expect(formatDatum(t, "en")).toBe("19 Oct 2026");
    expect(formatDatumDan(t, "en")).toBe("Mon, 19 Oct 2026");
  });
});
