
import "server-only";

import { extname } from "node:path";
import { fileTypeFromBuffer } from "file-type";

export const MAX_VELICINA_DATOTEKE = 20 * 1024 * 1024;

const EKSTENZIJE_TEKSTA = new Set([
  "txt",
  "md",
  "c",
  "h",
  "cpp",
  "hpp",
  "py",
  "java",
  "js",
  "ts",
]);

const TIPOVI_BINARNI: Record<
  string,
  { mime: string }
> = {
  pdf: { mime: "application/pdf" },
  zip: { mime: "application/zip" },
  png: { mime: "image/png" },
  jpg: { mime: "image/jpeg" },
};

export type DatotekaZaProvjeru = Pick<
  File,
  "name" | "size" | "arrayBuffer"
>;

export type DatotekaProvjerena = {
  bajtovi: Uint8Array;
  ekstenzija: string;
  mimeTip: string;
};

export async function provjeriDatoteku(
  datoteka: DatotekaZaProvjeru,
): Promise<DatotekaProvjerena> {
  const ekstenzija = extname(datoteka.name)
    .slice(1)
    .toLowerCase();

  const jeTekst = EKSTENZIJE_TEKSTA.has(ekstenzija);
  const binarniTip = TIPOVI_BINARNI[ekstenzija];

  if (!jeTekst && !binarniTip) {
    throw new Error("Vrsta datoteke nije dopuštena.");
  }

  if (
    !Number.isSafeInteger(datoteka.size) ||
    datoteka.size <= 0
  ) {
    throw new Error("Datoteka ne smije biti prazna.");
  }

  if (datoteka.size > MAX_VELICINA_DATOTEKE) {
    throw new Error("Datoteka ne smije biti veća od 20 MB.");
  }

  const bajtovi = new Uint8Array(
    await datoteka.arrayBuffer(),
  );

  // Provjeravamo stvarnu veličinu učitanog sadržaja.
  if (bajtovi.byteLength === 0) {
    throw new Error("Datoteka ne smije biti prazna.");
  }

  if (bajtovi.byteLength > MAX_VELICINA_DATOTEKE) {
    throw new Error("Datoteka ne smije biti veća od 20 MB.");
  }

  const otkriveniTip = await fileTypeFromBuffer(bajtovi);

  if (binarniTip) {
    if (
      !otkriveniTip ||
      otkriveniTip.mime !== binarniTip.mime
    ) {
      throw new Error(
        "Sadržaj datoteke ne odgovara njezinoj ekstenziji.",
      );
    }

    return {
      bajtovi,
      ekstenzija,
      mimeTip: binarniTip.mime,
    };
  }


  // Ako file-type prepozna binarni format, ne prihvaćamo
  // sadržaj kao običnu tekstualnu datoteku.
  if (otkriveniTip) {
    throw new Error(
      "Sadržaj datoteke nije dopušteni tekstualni format.",
    );
  }

  // Tekstualne datoteke ne smiju sadržavati NUL bajtove.
  if (bajtovi.includes(0)) {
    throw new Error(
      "Tekstualna datoteka sadrži nedopuštene bajtove.",
    );
  }

  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bajtovi);
  } catch {
    throw new Error(
      "Tekstualna datoteka mora biti valjan UTF-8 tekst.",
    );
  }

  return {
    bajtovi,
    ekstenzija,
    mimeTip: "text/plain; charset=utf-8",
  };
}