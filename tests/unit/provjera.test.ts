
import { describe, expect, it } from "vitest";

import {
  MAX_VELICINA_DATOTEKE,
  provjeriDatoteku,
  type DatotekaZaProvjeru,
} from "@/lib/datoteke/provjera";

function napraviDatoteku(
  name: string,
  sadržaj: Uint8Array,
  prijavljenaVeličina = sadržaj.byteLength,
): DatotekaZaProvjeru {
  const kopija = new Uint8Array(sadržaj);
  return {
    name,
    size: prijavljenaVeličina,
    arrayBuffer: async () => {
      const buffer = new Uint8Array(kopija.byteLength);
      buffer.set(kopija);
      return buffer.buffer;
    },
  };
}

describe("provjera datoteka", () => {
  it("prihvaća valjan PDF i normalizira ekstenziju", async () => {
    const sadržaj = new TextEncoder().encode(
      "%PDF-1.7\nSadržaj testnog dokumenta",
    );

    const rezultat = await provjeriDatoteku(
      napraviDatoteku("zadatak.PDF", sadržaj),
    );

    expect(rezultat.ekstenzija).toBe("pdf");
    expect(rezultat.mimeTip).toBe("application/pdf");
    expect(rezultat.bajtovi).toEqual(sadržaj);
  });

  it("prihvaća valjanu tekstualnu datoteku", async () => {
    const sadržaj = new TextEncoder().encode(
      "Ovo je testna tekstualna datoteka.",
    );

    const rezultat = await provjeriDatoteku(
      napraviDatoteku("zadatak.txt", sadržaj),
    );

    expect(rezultat.ekstenzija).toBe("txt");
    expect(rezultat.mimeTip).toBe("text/plain; charset=utf-8");
    expect(rezultat.bajtovi).toEqual(sadržaj);
  });

  it("odbija praznu datoteku", async () => {
    await expect(
      provjeriDatoteku(
        napraviDatoteku("prazno.txt", new Uint8Array()),
      ),
    ).rejects.toThrow("Datoteka ne smije biti prazna.");
  });

  it("odbija datoteku veću od 20 MiB", async () => {
    const datoteka = napraviDatoteku(
      "veliko.pdf",
      new Uint8Array([37, 80, 68, 70, 45]),
      MAX_VELICINA_DATOTEKE + 1,
    );

    await expect(provjeriDatoteku(datoteka)).rejects.toThrow(
      "Datoteka ne smije biti veća od 20 MB.",
    );
  });

  it("odbija nedopuštenu ekstenziju", async () => {
    await expect(
      provjeriDatoteku(
        napraviDatoteku(
          "program.exe",
          new Uint8Array([1, 2, 3]),
        ),
      ),
    ).rejects.toThrow("Vrsta datoteke nije dopuštena.");
  });

  it("odbija PNG sadržaj preimenovan u PDF", async () => {
    const pngPotpis = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47,
      0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52,
    ]);

    await expect(
      provjeriDatoteku(
        napraviDatoteku("slika.pdf", pngPotpis),
      ),
    ).rejects.toThrow(
      "Sadržaj datoteke ne odgovara njezinoj ekstenziji.",
    );
  });

  it("odbija tekstualnu datoteku koja sadrži NUL bajt", async () => {
    await expect(
      provjeriDatoteku(
        napraviDatoteku(
          "tekst.txt",
          new Uint8Array([65, 0, 66]),
        ),
      ),
    ).rejects.toThrow(
      "Tekstualna datoteka sadrži nedopuštene bajtove.",
    );
  });

  it("odbija nevaljan UTF-8 tekst", async () => {
    await expect(
      provjeriDatoteku(
        napraviDatoteku(
          "tekst.txt",
          new Uint8Array([0xc3, 0x28]),
        ),
      ),
    ).rejects.toThrow(
      "Tekstualna datoteka mora biti valjan UTF-8 tekst.",
    );
  });

  it("odbija binarni sadržaj s tekstualnom ekstenzijom", async () => {
    const pngPotpis = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47,
      0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52,
    ]);

    await expect(
      provjeriDatoteku(
        napraviDatoteku("slika.txt", pngPotpis),
      ),
    ).rejects.toThrow(
      "Sadržaj datoteke nije dopušteni tekstualni format.",
    );
  });
});