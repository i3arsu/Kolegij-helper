import { describe, expect, it } from "vitest";
import { ABECEDA_LOZINKE, generirajLozinku } from "@/lib/auth/generator-lozinke";
import { hashLozinke, provjeriLozinku, provjeriNovuLozinku } from "@/lib/auth/lozinka";

describe("generirajLozinku", () => {
  it("format xxxx-xxxx-xxxx bez dvosmislenih znakova, ~59 bita", () => {
    const l = generirajLozinku();
    expect(l).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(ABECEDA_LOZINKE).not.toMatch(/[01ilo]/);
    expect(12 * Math.log2(ABECEDA_LOZINKE.length)).toBeGreaterThan(58);
  });

  it("ne ponavlja se", () => {
    expect(new Set(Array.from({ length: 500 }, generirajLozinku)).size).toBe(500);
  });
});

describe("hash lozinke", () => {
  it("argon2id, verifikacija ispravne i neispravne lozinke", async () => {
    const h = await hashLozinke("tajna-lozinka-123");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await provjeriLozinku(h, "tajna-lozinka-123")).toBe(true);
    expect(await provjeriLozinku(h, "kriva")).toBe(false);
    expect(await provjeriLozinku("nije-hash", "x")).toBe(false);
  });
});

describe("provjeriNovuLozinku", () => {
  const k = { email: "ana.b@student.unipu.hr", jmbag: "0036512345" };
  it.each([
    ["kratka", "najmanje 10"],
    ["ana.b@student.unipu.hr", "e-mail"],
    ["ANA.B", "najmanje 10"],
    ["moj0036512345", "JMBAG"],
  ])("%s → greška", (l, dio) => {
    expect(provjeriNovuLozinku(l, k)).toContain(dio);
  });
  it("prihvaća dovoljno dugu lozinku", () => {
    expect(provjeriNovuLozinku("plavi-kit-pliva-7", k)).toBeNull();
  });
});
