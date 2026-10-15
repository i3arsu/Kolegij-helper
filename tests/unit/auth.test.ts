
import { describe, expect, it } from "vitest";
import {
  ABECEDA_LOZINKE,
  generirajLozinku,
} from "@/lib/auth/generator-lozinke";
import {
  hashLozinke,
  provjeriLozinku,
  provjeriNovuLozinku,
} from "@/lib/auth/lozinka";

describe("generirajLozinku", () => {
  it("format xxxx-xxxx-xxxx bez dvosmislenih znakova, ~59 bita", () => {
    const lozinka = generirajLozinku();

    expect(lozinka).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(ABECEDA_LOZINKE).not.toMatch(/[01ilo]/);
    expect(12 * Math.log2(ABECEDA_LOZINKE.length)).toBeGreaterThan(58);
  });

  it("ne ponavlja se", () => {
    const lozinke = Array.from({ length: 500 }, generirajLozinku);

    expect(new Set(lozinke).size).toBe(500);
  });
});

describe("hash lozinke", () => {
  it("argon2id, verifikacija ispravne i neispravne lozinke", async () => {
    const hash = await hashLozinke("tajna-lozinka-123");

    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await provjeriLozinku(hash, "tajna-lozinka-123")).toBe(true);
    expect(await provjeriLozinku(hash, "kriva")).toBe(false);
    expect(await provjeriLozinku("nije-hash", "x")).toBe(false);
  });
});

describe("provjeriNovuLozinku", () => {
  const korisnik = {
    email: "ana.b@student.unipu.hr",
    jmbag: "0036512345",
  };

  it.each([
    ["kratka", "prekratka"],
    ["ana.b@student.unipu.hr", "email"],
    ["ANA.B", "prekratka"],
    ["moj0036512345", "jmbag"],
  ] as const)(
    "%s → kod greške %s",
    (lozinka, ocekivaniRazlog) => {
      expect(provjeriNovuLozinku(lozinka, korisnik)).toBe(
        ocekivaniRazlog
      );
    }
  );

  it("prihvaća dovoljno dugu lozinku", () => {
    expect(
      provjeriNovuLozinku("plavi-kit-pliva-7", korisnik)
    ).toBeNull();
  });
});