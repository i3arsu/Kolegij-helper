
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

const TIPOVI_BINARNI: Record<string, { mime: string }> = {
  pdf: { mime: "application/pdf" },
  zip: { mime: "application/zip" },
  png: { mime: "image/png" },
  jpg: { mime: "image/jpeg" },
};

export type KljucGreskeDatoteke =
  | "fileTypeNotAllowed"
  | "emptyFile"
  | "fileTooLarge"
  | "fileContentMismatch"
  | "disallowedTextContent"
  | "textContainsNul"
  | "textMustBeUtf8";

export class GreskaProvjereDatoteke extends Error {
  constructor(readonly kljuc: KljucGreskeDatoteke) {
    super(kljuc);
    this.name = "GreskaProvjereDatoteke";
  }
}

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
    throw new GreskaProvjereDatoteke("fileTypeNotAllowed");
  }

  if (
    !Number.isSafeInteger(datoteka.size) ||
    datoteka.size <= 0
  ) {
    throw new GreskaProvjereDatoteke("emptyFile");
  }

  if (datoteka.size > MAX_VELICINA_DATOTEKE) {
    throw new GreskaProvjereDatoteke("fileTooLarge");
  }

  const bajtovi = new Uint8Array(
    await datoteka.arrayBuffer(),
  );

  if (bajtovi.byteLength === 0) {
    throw new GreskaProvjereDatoteke("emptyFile");
  }

  if (bajtovi.byteLength > MAX_VELICINA_DATOTEKE) {
    throw new GreskaProvjereDatoteke("fileTooLarge");
  }

  const otkriveniTip = await fileTypeFromBuffer(bajtovi);

  if (binarniTip) {
    if (
      !otkriveniTip ||
      otkriveniTip.mime !== binarniTip.mime
    ) {
      throw new GreskaProvjereDatoteke("fileContentMismatch");
    }

    return {
      bajtovi,
      ekstenzija,
      mimeTip: binarniTip.mime,
    };
  }

  if (otkriveniTip) {
    throw new GreskaProvjereDatoteke("disallowedTextContent");
  }

  if (bajtovi.includes(0)) {
    throw new GreskaProvjereDatoteke("textContainsNul");
  }

  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bajtovi);
  } catch {
    throw new GreskaProvjereDatoteke("textMustBeUtf8");
  }

  return {
    bajtovi,
    ekstenzija,
    mimeTip: "text/plain; charset=utf-8",
  };
}