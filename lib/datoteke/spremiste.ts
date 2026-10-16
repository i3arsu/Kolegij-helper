
import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createReadStream, type ReadStream } from "node:fs";
import {
  mkdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

export type KontekstSpremanja = {
  kolegijId: string;
  zadatakId: string;
  vlasnik: string;
};

export type SpremljenaDatoteka = {
  putanja: string;
  velicina: number;
  sha256: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dohvatiKorijen(): string {
  const direktorij = process.env.DATOTEKE_DIR?.trim();

  if (!direktorij) {
    throw new Error("DATOTEKE_DIR nije konfiguriran.");
  }

  return resolve(direktorij);
}

function provjeriUUID(vrijednost: string, naziv: string): void {
  if (!UUID_REGEX.test(vrijednost)) {
    throw new Error(`Neispravan identifikator: ${naziv}.`);
  }
}

function provjeriUnutar(
  korijen: string,
  kandidat: string,
  dopustiKorijen = false,
): void {
  const razlika = relative(korijen, kandidat);

  const sigurno =
    (dopustiKorijen && razlika === "") ||
    (razlika !== "" &&
      razlika !== ".." &&
      !razlika.startsWith(`..${sep}`) &&
      !isAbsolute(razlika));

  if (!sigurno) {
    throw new Error("Putanja datoteke izlazi iz DATOTEKE_DIR.");
  }
}

function razrijesiPutanju(putanja: string): {
  korijen: string;
  punaPutanja: string;
} {
  if (
    typeof putanja !== "string" ||
    putanja.length === 0 ||
    putanja.includes("\0") ||
    putanja.includes("\\") ||
    isAbsolute(putanja)
  ) {
    throw new Error("Neispravna putanja datoteke.");
  }

  const dijelovi = putanja.split("/");

  if (
    dijelovi.some(
      (dio) => dio === "" || dio === "." || dio === "..",
    )
  ) {
    throw new Error("Neispravna putanja datoteke.");
  }

  const korijen = dohvatiKorijen();
  const punaPutanja = resolve(korijen, ...dijelovi);

  provjeriUnutar(korijen, punaPutanja);

  return { korijen, punaPutanja };
}

function jeNedostajucaDatoteka(greska: unknown): boolean {
  return (
    typeof greska === "object" &&
    greska !== null &&
    "code" in greska &&
    greska.code === "ENOENT"
  );
}

/**
 * Sprema bajtove u:
 * kolegij/zadatak/vlasnik/random-uuid
 *
 * Izvorni naziv datoteke nikada se ne koristi u putanji.
 */
export async function spremi(
  bajtovi: Uint8Array,
  { kolegijId, zadatakId, vlasnik }: KontekstSpremanja,
): Promise<SpremljenaDatoteka> {
  provjeriUUID(kolegijId, "kolegijId");
  provjeriUUID(zadatakId, "zadatakId");
  provjeriUUID(vlasnik, "vlasnik");

  const korijen = dohvatiKorijen();

  await mkdir(korijen, {
    recursive: true,
    mode: 0o700,
  });

  const stvarniKorijen = await realpath(korijen);

  const direktoriji = [kolegijId, zadatakId, vlasnik];
  let direktorij = korijen;

  for (const dio of direktoriji) {
    direktorij = resolve(direktorij, dio);
    provjeriUnutar(korijen, direktorij);

    await mkdir(direktorij, {
      recursive: true,
      mode: 0o700,
    });

    const stvarniDirektorij = await realpath(direktorij);

    provjeriUnutar(stvarniKorijen, stvarniDirektorij);

    const informacije = await stat(stvarniDirektorij);

    if (!informacije.isDirectory()) {
      throw new Error("Putanja spremanja nije direktorij.");
    }
  }

  const naziv = randomUUID();
  const putanja = [...direktoriji, naziv].join("/");
  const punaPutanja = resolve(direktorij, naziv);

  provjeriUnutar(korijen, punaPutanja);

  // "wx" odbija postojeću putanju umjesto da prepiše datoteku.
  await writeFile(punaPutanja, bajtovi, {
    flag: "wx",
    mode: 0o600,
  });

  return {
    putanja,
    velicina: bajtovi.byteLength,
    sha256: createHash("sha256").update(bajtovi).digest("hex"),
  };
}

/** Otvara postojeću datoteku za čitanje nakon provjere putanje. */
export async function otvori(putanja: string): Promise<ReadStream> {
  const { korijen, punaPutanja } = razrijesiPutanju(putanja);

  const stvarniKorijen = await realpath(korijen);
  const stvarnaPutanja = await realpath(punaPutanja);

  provjeriUnutar(stvarniKorijen, stvarnaPutanja);

  const informacije = await stat(stvarnaPutanja);

  if (!informacije.isFile()) {
    throw new Error("Putanja ne pokazuje na datoteku.");
  }

  return createReadStream(stvarnaPutanja);
}

/** Briše datoteku. Poziv je siguran i kada datoteka više ne postoji. */
export async function obrisi(putanja: string): Promise<void> {
  const { korijen, punaPutanja } = razrijesiPutanju(putanja);

  let stvarniKorijen: string;
  let stvarniRoditelj: string;

  try {
    stvarniKorijen = await realpath(korijen);
    stvarniRoditelj = await realpath(dirname(punaPutanja));
  } catch (greska) {
    if (jeNedostajucaDatoteka(greska)) return;
    throw greska;
  }

  // Provjeravamo stvarnu lokaciju roditeljskog direktorija,
  // a ne samo tekstualnu putanju.
  provjeriUnutar(stvarniKorijen, stvarniRoditelj, true);

  await rm(punaPutanja, { force: true });
}