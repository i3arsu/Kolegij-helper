/**
 * Razvojni seed za Kolegij-helper.
 *
 * Stvara:
 * - Programiranje 2, osoblje, grupe i 25 izmišljenih studenata.
 * - 15 tjedana termina i evidenciju dolaznosti.
 * - Zadane scenarije Z1-Z4 iz PLAN.md §12.
 * - Povijesne predaje, verzije, povratne informacije i lažne PDF datoteke.
 * - Tri predloška komentara i ogledne CSV datoteke.
 *
 * Svi računi dobivaju SEED_LOZINKA iz .env.
 * POZOR: rekonstruira razvojne podatke pomoću TRUNCATE CASCADE.
 * Odbija NODE_ENV=production. Ne pokretati nad bazom čije podatke želite sačuvati.
 *
 *   npm run seed
 */
import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { TZDate } from "@date-fns/tz";
import { addDays, format, startOfWeek } from "date-fns";
import { sql } from "kysely";

import { napraviBazu, type Tx } from "../lib/db/klijent";
import { urlBaze } from "../lib/db/url";
import { hashLozinke } from "../lib/auth/lozinka";
import { lokalnoUTrenutak, ZONA } from "../lib/domena/vrijeme";

const LOZINKA = process.env.SEED_LOZINKA;
const DATOTEKE_DIR = process.env.DATOTEKE_DIR?.trim();
const URL = urlBaze("app_owner");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STUDENTI: [string, string][] = [
  ["Ivan", "Horvat"], ["Ana", "Kovačević"], ["Luka", "Babić"], ["Petra", "Marić"], ["Marko", "Jurić"],
  ["Lucija", "Novak"], ["Matej", "Knežević"], ["Ema", "Vuković"], ["Filip", "Marković"], ["Sara", "Petrović"],
  ["Josip", "Matić"], ["Mia", "Tomić"], ["Karlo", "Pavlović"], ["Lana", "Božić"], ["David", "Kovač"],
  ["Iva", "Grgić"], ["Antonio", "Blažević"], ["Klara", "Šarić"], ["Ivan", "Horvat"], ["Nika", "Đurić"],
  ["Toni", "Radić"], ["Dora", "Perković"], ["Fran", "Lovrić"], ["Ena", "Čolić"], ["Leon", "Žagar"],
];

const GRANICNI = new Set([3, 9, 14, 21]);
const ISPOD_PRAGA = new Set([6, 16, 23]);
const PREMJESTEN = 12;
const ISPISAN = 24;
const MORA_PROMIJENITI = 5;
const GOST = 1;

const TEME_P = [
  "Uvod i ponavljanje", "Pokazivači", "Dinamička memorija", "Strukture", "Vezane liste", "Stog i red",
  "Rekurzija", "Stabla", "Binarna stabla pretraživanja", "Hash tablice", "Sortiranje", "Datoteke",
  "Modularno programiranje", "Testiranje", "Ponavljanje",
];

type DirektorijiSeed = {
  seedKorijen: string;
  runId: string;
  runDirektorij: string;
};

type StudentSeed = {
  id: string;
  korisnikId: string;
  i: number;
  v: string;
};

type OsobljeSeed = {
  id: string;
  korisnikId: string;
};

type PovratnaSeed = {
  autorId: string;
  komentar: string;
  odluka: "vraceno_na_doradu" | "prihvaceno";
  bodovi: number | null;
  rokDorade: Date | null;
  createdAt: Date;
};

type VerzijaSeed = {
  broj: number;
  predanoAt: Date;
  tekst: string;
  povratna?: PovratnaSeed;
  nazivDatoteke: string;
};

type PredajaSeed = {
  zadatakId: string;
  student: StudentSeed;
  status: "u_pregledu" | "vraceno_na_doradu" | "prihvaceno";
  bodovi: number | null;
  pregledava: string | null;
  verzije: VerzijaSeed[];
};

function ascii(vrijednost: string): string {
  return vrijednost
    .toLowerCase()
    .replaceAll("đ", "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function napraviGenerator(): () => number {
  let stanje = 42;

  return () => {
    stanje = (stanje + 0x6d2b79f5) | 0;
    let t = Math.imul(stanje ^ (stanje >>> 15), 1 | stanje);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function datumPomaknut(danas: TZDate, brojDana: number): string {
  return format(addDays(danas, brojDana), "yyyy-MM-dd");
}

function lokalniDatum(danas: TZDate, brojDana: number, vrijeme: string): Date {
  return lokalnoUTrenutak(datumPomaknut(danas, brojDana), vrijeme);
}

function sigurnaPdfLinija(tekst: string): string {
  return ascii(tekst)
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/** Stvara mali PDF s jednom stranicom, valjanim xref-om i ASCII sadržajem. */
function napraviPdf(tekst: string): Buffer {
  const stream = `BT /F1 12 Tf 50 740 Td (${sigurnaPdfLinija(tekst)}) Tj ET`;
  const objekti = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`,
  ];

  let sadrzaj = "%PDF-1.4\n%Seed PDF\n";
  const pomaci: number[] = [0];

  for (const [indeks, objekt] of objekti.entries()) {
    pomaci.push(Buffer.byteLength(sadrzaj, "ascii"));
    sadrzaj += `${indeks + 1} 0 obj\n${objekt}\nendobj\n`;
  }

  const xrefPomak = Buffer.byteLength(sadrzaj, "ascii");
  sadrzaj += `xref\n0 ${objekti.length + 1}\n`;
  sadrzaj += "0000000000 65535 f \n";

  for (const pomak of pomaci.slice(1)) {
    sadrzaj += `${String(pomak).padStart(10, "0")} 00000 n \n`;
  }

  sadrzaj += `trailer\n<< /Size ${objekti.length + 1} /Root 1 0 R >>\n`;
  sadrzaj += `startxref\n${xrefPomak}\n%%EOF\n`;

  return Buffer.from(sadrzaj, "ascii");
}

async function pripremiDirektorijeDatoteka(): Promise<DirektorijiSeed> {
  if (!DATOTEKE_DIR) {
    throw new Error("DATOTEKE_DIR nije konfiguriran u .env.");
  }

  const zadaniKorijen = resolve(DATOTEKE_DIR);
  await mkdir(zadaniKorijen, { recursive: true, mode: 0o700 });
  const korijen = await realpath(zadaniKorijen);
  const seedKorijen = resolve(korijen, "seed");

  try {
    const informacije = await lstat(seedKorijen);
    if (informacije.isSymbolicLink() || !informacije.isDirectory()) {
      throw new Error("DATOTEKE_DIR/seed mora biti običan direktorij, ne simbolička poveznica.");
    }
  } catch (greska) {
    if (
      typeof greska !== "object" ||
      greska === null ||
      !("code" in greska) ||
      greska.code !== "ENOENT"
    ) {
      throw greska;
    }

    await mkdir(seedKorijen, { mode: 0o700 });
  }

  const stvarniSeedKorijen = await realpath(seedKorijen);
  const relativnaPutanja = relative(korijen, stvarniSeedKorijen);
  if (relativnaPutanja !== "seed" && relativnaPutanja !== `seed${sep}`) {
    throw new Error("Seed direktorij izlazi iz DATOTEKE_DIR.");
  }

  const runId = randomUUID();
  const runDirektorij = resolve(stvarniSeedKorijen, runId);
  await mkdir(runDirektorij, { mode: 0o700 });

  const stvarniRunDirektorij = await realpath(runDirektorij);
  const relativniRun = relative(stvarniSeedKorijen, stvarniRunDirektorij);
  if (relativniRun === "" || relativniRun.startsWith(`..${sep}`) || relativniRun === "..") {
    throw new Error("Seed run direktorij izlazi iz dopuštenog direktorija.");
  }

  return {
    seedKorijen: stvarniSeedKorijen,
    runId,
    runDirektorij: stvarniRunDirektorij,
  };
}

async function obrisiRunDirektorij(direktoriji: DirektorijiSeed): Promise<void> {
  await rm(direktoriji.runDirektorij, { recursive: true, force: true });
}

/** Briše samo stare UUID direktorije koje je kreirao ovaj seed. */
async function obrisiStareSeedDirektorije(direktoriji: DirektorijiSeed): Promise<void> {
  const stavke = await readdir(direktoriji.seedKorijen, { withFileTypes: true });

  for (const stavka of stavke) {
    if (stavka.name === direktoriji.runId || !UUID_REGEX.test(stavka.name)) {
      continue;
    }

    await rm(resolve(direktoriji.seedKorijen, stavka.name), {
      recursive: true,
      force: true,
    });
  }
}

async function spremiPdfPredaje(
  tx: Tx,
  direktoriji: DirektorijiSeed,
  args: {
    verzijaId: string;
    vlasnikId: string;
    naziv: string;
    tekst: string;
  },
): Promise<void> {
  const id = randomUUID();
  const bajtovi = napraviPdf(args.tekst);
  const nazivDatoteke = `${id}.pdf`;
  const putanja = `seed/${direktoriji.runId}/${nazivDatoteke}`;

  await writeFile(resolve(direktoriji.runDirektorij, nazivDatoteke), bajtovi, {
    flag: "wx",
    mode: 0o600,
  });

  await tx
    .insertInto("datoteka")
    .values({
      id,
      putanja,
      naziv: args.naziv,
      velicina: bajtovi.byteLength,
      mime: "application/pdf",
      sha256: createHash("sha256").update(bajtovi).digest("hex"),
      vlasnik: args.vlasnikId,
    })
    .execute();

  await tx
    .insertInto("predaja_datoteka")
    .values({ verzija_id: args.verzijaId, datoteka_id: id })
    .execute();
}

async function kreirajPredaju(
  tx: Tx,
  direktoriji: DirektorijiSeed,
  predaja: PredajaSeed,
): Promise<string> {
  const red = await tx
    .insertInto("predaja")
    .values({
      zadatak_id: predaja.zadatakId,
      student_id: predaja.student.id,
      status: predaja.status,
      trenutna_verzija: predaja.verzije.length,
      bodovi: predaja.bodovi,
      pregledava: predaja.pregledava,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  for (const verzija of predaja.verzije) {
    const redVerzije = await tx
      .insertInto("predaja_verzija")
      .values({
        predaja_id: red.id,
        broj: verzija.broj,
        tekst: verzija.tekst,
        link: null,
        predano_at: verzija.predanoAt,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await spremiPdfPredaje(tx, direktoriji, {
      verzijaId: redVerzije.id,
      vlasnikId: predaja.student.korisnikId,
      naziv: verzija.nazivDatoteke,
      tekst: verzija.tekst,
    });

    if (verzija.povratna) {
      await tx
        .insertInto("povratna_informacija")
        .values({
          predaja_id: red.id,
          verzija_broj: verzija.broj,
          autor_id: verzija.povratna.autorId,
          komentar: verzija.povratna.komentar,
          bodovi: verzija.povratna.bodovi,
          odluka: verzija.povratna.odluka,
          rok_dorade: verzija.povratna.rokDorade,
          created_at: verzija.povratna.createdAt,
        })
        .execute();
    }
  }

  return red.id;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed se ne smije pokretati u produkciji.");
  }
  if (!LOZINKA) {
    throw new Error("Postavite SEED_LOZINKA u .env.");
  }
  if (!DATOTEKE_DIR) {
    throw new Error("Postavite DATOTEKE_DIR u .env.");
  }

  const db = napraviBazu(URL, 2);
  let direktoriji: DirektorijiSeed | null = null;
  let transakcijaPotvrdjena = false;
  let studentiCsv: string[] = [];

  try {
    const hash = await hashLozinke(LOZINKA);
    const direktorijiAktivni = await pripremiDirektorijeDatoteka();
    direktoriji = direktorijiAktivni;

    await db.transaction().execute(async (tx) => {
      // Potpuno resetiranje baze unutar transakcije: pri grešci se i TRUNCATE vraća.
      await sql`
        truncate korisnik, kolegij, sesija, prijava_pokusaj, revizija
        restart identity cascade
      `.execute(tx);

      // ------------------------------------------------------------
      // 1. Korisnici i osoblje
      // ------------------------------------------------------------
      const noviKorisnik = async (
        email: string,
        opcije: { admin?: boolean; mora?: boolean } = {},
      ): Promise<string> => {
        const red = await tx
          .insertInto("korisnik")
          .values({
            email,
            lozinka_hash: hash,
            je_admin: opcije.admin ?? false,
            mora_promijeniti_lozinku: opcije.mora ?? false,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        return red.id;
      };

      const novoOsoblje = async (
        email: string,
        ime: string,
        prezime: string,
        titula: string | null,
      ): Promise<OsobljeSeed> => {
        const korisnikId = await noviKorisnik(email);
        const red = await tx
          .insertInto("osoblje")
          .values({ korisnik_id: korisnikId, ime, prezime, titula })
          .returning("id")
          .executeTakeFirstOrThrow();
        return { id: red.id, korisnikId };
      };

      const adminId = await noviKorisnik("admin@unipu.test", { admin: true });
      const peric = await novoOsoblje("marko.peric@unipu.test", "Marko", "Perić", "doc. dr. sc.");
      const juric = await novoOsoblje("ivana.juric@unipu.test", "Ivana", "Jurić", "mag. inf.");
      const kos = await novoOsoblje("tomislav.kos@unipu.test", "Tomislav", "Kos", "mag. inf.");

      // ------------------------------------------------------------
      // 2. Kolegij, pravila, grupe i osoblje grupa
      // ------------------------------------------------------------
      const kolegij = (
        await tx
          .insertInto("kolegij")
          .values({
            naziv: "Programiranje 2",
            sifra: "PRG2",
            akademska_godina: "2026/2027",
            semestar: "zimski",
          })
          .returning("id")
          .executeTakeFirstOrThrow()
      ).id;

      await tx
        .updateTable("pravila_prolaza")
        .set({
          min_dolaznost_predavanja: 50,
          min_dolaznost_vjezbi: 75,
          min_bodova: 50,
        })
        .where("kolegij_id", "=", kolegij)
        .execute();

      await tx
        .insertInto("osoblje_kolegija")
        .values([
          { kolegij_id: kolegij, osoblje_id: peric.id, uloga: "nastavnik" },
          { kolegij_id: kolegij, osoblje_id: juric.id, uloga: "asistent" },
          { kolegij_id: kolegij, osoblje_id: kos.id, uloga: "asistent" },
        ])
        .execute();

      const grupa: Record<string, string> = {};
      for (const [naziv, tip] of [
        ["P1", "predavanje"],
        ["V1", "vjezbe"],
        ["V2", "vjezbe"],
        ["V3", "vjezbe"],
      ] as const) {
        grupa[naziv] = (
          await tx
            .insertInto("grupa")
            .values({ kolegij_id: kolegij, naziv, tip })
            .returning("id")
            .executeTakeFirstOrThrow()
        ).id;
      }

      await tx
        .insertInto("asistent_grupa")
        .values([
          { grupa_id: grupa.V1, osoblje_id: kos.id },
          { grupa_id: grupa.V2, osoblje_id: juric.id },
          { grupa_id: grupa.V3, osoblje_id: juric.id },
        ])
        .execute();

      // ------------------------------------------------------------
      // 3. Termini
      // ------------------------------------------------------------
      const danas = new TZDate(Date.now(), ZONA);
      const pocetakSemestra = addDays(startOfWeek(danas, { weekStartsOn: 1 }), -42);
      const raspored = [
        { g: "P1", dan: 0, od: "10:00", do: "11:30" },
        { g: "V1", dan: 1, od: "08:00", do: "09:30" },
        { g: "V2", dan: 1, od: "10:00", do: "11:30" },
        { g: "V3", dan: 2, od: "12:00", do: "13:30" },
      ];

      const termini: { id: string; g: string; tjedan: number; pocetak: Date }[] = [];
      for (let tjedan = 0; tjedan < 15; tjedan++) {
        for (const rasporedGrupa of raspored) {
          const datum = format(
            addDays(pocetakSemestra, tjedan * 7 + rasporedGrupa.dan),
            "yyyy-MM-dd",
          );
          const pocetak = lokalnoUTrenutak(datum, rasporedGrupa.od);
          const red = await tx
            .insertInto("termin")
            .values({
              kolegij_id: kolegij,
              grupa_id: grupa[rasporedGrupa.g],
              pocetak,
              kraj: lokalnoUTrenutak(datum, rasporedGrupa.do),
              tema:
                rasporedGrupa.g === "P1"
                  ? TEME_P[tjedan]
                  : `Vježbe: ${TEME_P[tjedan].toLowerCase()}`,
              otkazan: rasporedGrupa.g === "V2" && tjedan === 3,
            })
            .returning("id")
            .executeTakeFirstOrThrow();

          termini.push({
            id: red.id,
            g: rasporedGrupa.g,
            tjedan,
            pocetak,
          });
        }
      }

      const pocetakTjedna4 = lokalnoUTrenutak(
        format(addDays(pocetakSemestra, 28), "yyyy-MM-dd"),
        "00:00",
      );

      // ------------------------------------------------------------
      // 4. Studenti, upisi, članstva i CSV redovi
      // ------------------------------------------------------------
      const vGrupa = (indeks: number) =>
        indeks < 9 ? "V1" : indeks < 17 ? "V2" : "V3";
      studentiCsv = ["JMBAG;Prezime;Ime;E-mail;Grupa P;Grupa V"];
      const studenti: StudentSeed[] = [];
      const vidjeniEmailovi = new Set<string>();

      for (const [i, [ime, prezime]] of STUDENTI.entries()) {
        let email = `${ascii(ime)}.${ascii(prezime)}@student.unipu.test`;
        if (vidjeniEmailovi.has(email)) email = email.replace("@", "2@");
        vidjeniEmailovi.add(email);

        const jmbag = `99${String(1000000 + i * 7919).padStart(8, "0")}`.slice(0, 10);
        const korisnikId = await noviKorisnik(email, { mora: i === MORA_PROMIJENITI });
        const studentId = (
          await tx
            .insertInto("student")
            .values({ korisnik_id: korisnikId, jmbag, ime, prezime })
            .returning("id")
            .executeTakeFirstOrThrow()
        ).id;
        const upisId = (
          await tx
            .insertInto("upis")
            .values({
              kolegij_id: kolegij,
              student_id: studentId,
              status: i === ISPISAN ? "ispisan" : "aktivan",
            })
            .returning("id")
            .executeTakeFirstOrThrow()
        ).id;

        const v = vGrupa(i);
        await tx
          .insertInto("clanstvo_grupe")
          .values({
            upis_id: upisId,
            grupa_id: grupa.P1,
            tip: "predavanje",
            vrijedi: "(,)",
          })
          .execute();

        if (i === PREMJESTEN) {
          await tx
            .insertInto("clanstvo_grupe")
            .values([
              {
                upis_id: upisId,
                grupa_id: grupa.V2,
                tip: "vjezbe",
                vrijedi: sql<string>`tstzrange(null, ${pocetakTjedna4})`,
              },
              {
                upis_id: upisId,
                grupa_id: grupa.V3,
                tip: "vjezbe",
                vrijedi: sql<string>`tstzrange(${pocetakTjedna4}, null)`,
              },
            ])
            .execute();
        } else {
          await tx
            .insertInto("clanstvo_grupe")
            .values({
              upis_id: upisId,
              grupa_id: grupa[v],
              tip: "vjezbe",
              vrijedi: "(,)",
            })
            .execute();
        }

        const trenutnaGrupa = i === PREMJESTEN ? "V3" : v;
        studenti.push({ id: studentId, korisnikId, i, v: trenutnaGrupa });
        studentiCsv.push([jmbag, prezime, ime, email, "P1", trenutnaGrupa].join(";"));
      }

      // ------------------------------------------------------------
      // 5. Dolaznost
      // ------------------------------------------------------------
      const slucajno = napraviGenerator();
      const sada = Date.now();
      const prosli = termini.filter((termin) => termin.pocetak.getTime() < sada);
      const neevidentiran = [...prosli].reverse().find((termin) => termin.g === "V1");

      for (const termin of prosli) {
        if (termin.id === neevidentiran?.id) continue;
        if (termin.g === "V2" && termin.tjedan === 3) continue;

        for (const student of studenti) {
          if (student.i === ISPISAN && termin.tjedan > 2) continue;
          const clan =
            termin.g === "P1" ||
            (student.i === PREMJESTEN
              ? termin.tjedan < 4
                ? termin.g === "V2"
                : termin.g === "V3"
              : student.v === termin.g);
          if (!clan) continue;

          const vjerojatnost = ISPOD_PRAGA.has(student.i)
            ? 0.45
            : GRANICNI.has(student.i)
              ? 0.75
              : 0.95;
          const x = slucajno();
          const status =
            x < vjerojatnost
              ? "prisutan"
              : x < vjerojatnost + 0.06
                ? "opravdano"
                : "odsutan";

          await tx
            .insertInto("dolazak")
            .values({
              termin_id: termin.id,
              student_id: student.id,
              status,
              napomena: status === "opravdano" ? "Liječnička ispričnica" : null,
            })
            .execute();
        }

        await tx
          .updateTable("termin")
          .set({ evidencija_spremljena_at: new Date(termin.pocetak.getTime() + 90 * 60_000) })
          .where("id", "=", termin.id)
          .execute();
      }

      const gostTermin = termini.find((termin) => termin.g === "V2" && termin.tjedan === 1);
      if (gostTermin && gostTermin.pocetak.getTime() < sada) {
        await tx
          .insertInto("dolazak")
          .values({
            termin_id: gostTermin.id,
            student_id: studenti[GOST].id,
            status: "prisutan",
            gost: true,
            napomena: "Nadoknada",
          })
          .execute();
      }

      // ------------------------------------------------------------
      // 6. Zadaci Z1-Z4 i predlošci komentara
      // ------------------------------------------------------------
      const crearZadatak = async (args: {
        naslov: string;
        opis: string;
        rok: Date;
        objavljenAt: Date | null;
        zaCijeliKolegij: boolean;
        grupe?: string[];
      }): Promise<string> => {
        const zadatakId = (
          await tx
            .insertInto("zadatak")
            .values({
              kolegij_id: kolegij,
              naslov: args.naslov,
              opis: args.opis,
              rok: args.rok,
              max_bodova: 100,
              nacini_predaje: ["datoteka"],
              dopusti_kasnu_predaju: true,
              za_cijeli_kolegij: args.zaCijeliKolegij,
              objavljen_at: args.objavljenAt,
              created_by: peric.korisnikId,
            })
            .returning("id")
            .executeTakeFirstOrThrow()
        ).id;

        if (args.grupe?.length) {
          await tx
            .insertInto("zadatak_grupa")
            .values(args.grupe.map((naziv) => ({ zadatak_id: zadatakId, grupa_id: grupa[naziv] })))
            .execute();
        }

        return zadatakId;
      };

      const z1Rok = lokalniDatum(danas, -21, "23:59");
      const z2Rok = lokalniDatum(danas, -14, "23:59");
      const z3Rok = lokalniDatum(danas, 3, "23:59");

      const z1 = await crearZadatak({
        naslov: "Rekurzija",
        opis: "Riješite zadatke o rekurzivnim funkcijama i objasnite korake izvođenja.",
        rok: z1Rok,
        objavljenAt: lokalniDatum(danas, -42, "09:00"),
        zaCijeliKolegij: true,
      });
      const z2 = await crearZadatak({
        naslov: "Vezane liste",
        opis: "Implementirajte osnovne operacije nad jednostruko vezanom listom.",
        rok: z2Rok,
        objavljenAt: lokalniDatum(danas, -35, "09:00"),
        zaCijeliKolegij: true,
      });
      const z3 = await crearZadatak({
        naslov: "Binarna stabla",
        opis: "Implementirajte pretraživanje i obilazak binarnog stabla. Zadatak je dodijeljen grupama V1 i V2.",
        rok: z3Rok,
        objavljenAt: lokalniDatum(danas, -7, "09:00"),
        zaCijeliKolegij: false,
        grupe: ["V1", "V2"],
      });
      const z4 = await crearZadatak({
        naslov: "Projekt",
        opis: "Skica semestralnog projekta. Zadatak još nije objavljen.",
        rok: lokalniDatum(danas, 30, "23:59"),
        objavljenAt: null,
        zaCijeliKolegij: false,
        grupe: ["V1", "V2", "V3"],
      });

      await tx
        .insertInto("predlozak_komentara")
        .values([
          {
            kolegij_id: kolegij,
            naslov: "Dobro riješeno",
            tekst: "Rješenje je jasno i ispravno. Nastavite tako!",
          },
          {
            kolegij_id: kolegij,
            naslov: "Potrebna dorada",
            tekst: "Provjerite rubne slučajeve i dopunite objašnjenje postupka.",
          },
          {
            kolegij_id: kolegij,
            naslov: "Nedostaje objašnjenje",
            tekst: "Dodajte kratko objašnjenje algoritma i složenosti rješenja.",
          },
        ])
        .execute();

      // Asistent V1 pregledava V1; asistentica pregledava V2 i V3.
      const asistentZaStudenta = (student: StudentSeed) =>
        student.v === "V1" ? kos.korisnikId : juric.korisnikId;

      // ------------------------------------------------------------
      // 7. Z1: sve aktivne predaje prihvaćene, dvije zakašnjele
      // ------------------------------------------------------------
      const aktivniStudenti = studenti.filter((student) => student.i !== ISPISAN);

      for (const student of aktivniStudenti) {
        const kasni = student.i === 22 || student.i === 23;
        const predanoAt = lokalniDatum(danas, kasni ? -19 : -28, "12:00");
        const ocijenjenoAt = lokalniDatum(danas, kasni ? -18 : -27, "15:00");
        const bodovi = 65 + (student.i % 36);

        await kreirajPredaju(tx, direktorijiAktivni, {
          zadatakId: z1,
          student,
          status: "prihvaceno",
          bodovi,
          pregledava: null,
          verzije: [
            {
              broj: 1,
              predanoAt,
              tekst: `Rješenje zadatka Rekurzija za studenta ${student.i + 1}.`,
              nazivDatoteke: `Rekurzija-${student.i + 1}.pdf`,
              povratna: {
                autorId: peric.korisnikId,
                komentar: kasni
                  ? "Rješenje je prihvaćeno. Predaja je evidentirana nakon roka."
                  : "Rješenje je ispravno i dobro objašnjeno.",
                odluka: "prihvaceno",
                bodovi,
                rokDorade: null,
                createdAt: ocijenjenoAt,
              },
            },
          ],
        });
      }

      // ------------------------------------------------------------
      // 8. Z2: 8 prihvaćenih, 6 vraćenih, 7 u pregledu, 3 bez predaje
      // ------------------------------------------------------------
      for (const student of aktivniStudenti.slice(0, 8)) {
        const bodovi = 70 + (student.i % 26);
        await kreirajPredaju(tx, direktorijiAktivni, {
          zadatakId: z2,
          student,
          status: "prihvaceno",
          bodovi,
          pregledava: null,
          verzije: [
            {
              broj: 1,
              predanoAt: lokalniDatum(danas, -24, "10:00"),
              tekst: `Prihvaćeno rješenje vezane liste, student ${student.i + 1}.`,
              nazivDatoteke: `Vezane-liste-prihvaceno-${student.i + 1}.pdf`,
              povratna: {
                autorId: peric.korisnikId,
                komentar: "Implementacija operacija nad vezanom listom je ispravna.",
                odluka: "prihvaceno",
                bodovi,
                rokDorade: null,
                createdAt: lokalniDatum(danas, -23, "14:00"),
              },
            },
          ],
        });
      }

      for (const student of aktivniStudenti.slice(8, 14)) {
        const imaDruguVerziju = student.i === 13;
        const prvaPredaja: VerzijaSeed = {
          broj: 1,
          predanoAt: lokalniDatum(danas, -24, "11:00"),
          tekst: `Prva verzija zadatka Vezane liste, student ${student.i + 1}.`,
          nazivDatoteke: `Vezane-liste-v1-${student.i + 1}.pdf`,
          povratna: {
            autorId: asistentZaStudenta(student),
            komentar: "Potrebno je ispraviti obradu prazne liste i dodati provjeru rubnih slučajeva.",
            odluka: "vraceno_na_doradu",
            bodovi: null,
            rokDorade: lokalniDatum(danas, -18, "23:59"),
            createdAt: lokalniDatum(danas, -23, "15:00"),
          },
        };

        const verzije: VerzijaSeed[] = [prvaPredaja];
        if (imaDruguVerziju) {
          verzije.push({
            broj: 2,
            predanoAt: lokalniDatum(danas, -17, "10:00"),
            tekst: `Druga verzija zadatka Vezane liste, student ${student.i + 1}.`,
            nazivDatoteke: `Vezane-liste-v2-${student.i + 1}.pdf`,
            povratna: {
              autorId: asistentZaStudenta(student),
              komentar: "Druga verzija još uvijek treba ispravak brisanja posljednjeg čvora.",
              odluka: "vraceno_na_doradu",
              bodovi: null,
              rokDorade: lokalniDatum(danas, 4, "23:59"),
              createdAt: lokalniDatum(danas, -16, "13:00"),
            },
          });
        }

        await kreirajPredaju(tx, direktorijiAktivni, {
          zadatakId: z2,
          student,
          status: "vraceno_na_doradu",
          bodovi: null,
          pregledava: null,
          verzije,
        });
      }

      for (const student of aktivniStudenti.slice(14, 21)) {
        await kreirajPredaju(tx, direktorijiAktivni, {
          zadatakId: z2,
          student,
          status: "u_pregledu",
          bodovi: null,
          pregledava: asistentZaStudenta(student),
          verzije: [
            {
              broj: 1,
              predanoAt: lokalniDatum(danas, -5, "11:00"),
              tekst: `Rješenje vezane liste čeka pregled, student ${student.i + 1}.`,
              nazivDatoteke: `Vezane-liste-pregled-${student.i + 1}.pdf`,
            },
          ],
        });
      }
      // Posljednja tri aktivna studenta namjerno nemaju red u public.predaja.
      // Pogled v_predaja za njih prikazuje status nije_predano.

      // Z3 ostaje bez unaprijed kreiranih predaja: koristi se u Happy Path E2E.
      // Student A je indeks 0 (V1), student B indeks 17 (V3, nije dodijeljen Z3).
      // Z4 je neobjavljena skica.

      console.log(`Seed scenarij pripremljen: Z1=${z1}, Z2=${z2}, Z3=${z3}, Z4=${z4}`);
      console.log(`Student A: ${studenti[0].i} / ${studenti[0].korisnikId}`);
      console.log(`Student B: ${studenti[17].i} / ${studenti[17].korisnikId}`);
      console.log(`Admin: ${adminId}`);
    });

    transakcijaPotvrdjena = true;

    // --------------------------------------------------------------
    // 9. CSV datoteke za testiranje uvoza
    // --------------------------------------------------------------
    await mkdir("db/podaci", { recursive: true });

    await writeFile("db/podaci/studenti-prg2.csv", `\uFEFF${studentiCsv.join("\r\n")}\r\n`, "utf8");
    await writeFile(
      "db/podaci/ponovni-uvoz.csv",
      `\uFEFF${studentiCsv
        .map((red, i) =>
          i === 2
            ? red.replace("Ana", "Ana Marija")
            : i === 4
              ? red.replace("petra.maric@", "petra.maric.nova@")
              : i === 7
                ? red.replace(/V1$/, "V2")
                : red,
        )
        .concat(["9912345678;Novak;Tin;tin.novak@student.unipu.test;P1;V2"])
        .join("\r\n")}\r\n`,
      "utf8",
    );
    await writeFile(
      "db/podaci/studenti-s-greskama.csv",
      [
        "JMBAG,Ime,Prezime,Email,Grupa V",
        "0036512345,Marta,Kralj,marta.kralj@student.unipu.test,V1",
        "12345,Kratki,Jmbag,kratki@student.unipu.test,V1",
        "0036512346,Bez,Emaila,,V2",
        "0036512347,Kriva,Grupa,kriva.grupa@student.unipu.test,V9",
        "0036512348,Dupli,Prvi,dupli1@student.unipu.test,V1",
        "0036512348,Dupli,Drugi,dupli2@student.unipu.test,V2",
        "0036512349,Tuđi,Email,ana.kovacevic@student.unipu.test,V3",
      ].join("\n") + "\n",
      "utf8",
    );

    // Stari seed PDF-ovi više nisu povezani s bazom nakon uspješnog TRUNCATE+seed.
    // Brišemo samo UUID direktorije koje je ovaj seed stvorio pod DATOTEKE_DIR/seed.
    try {
      await obrisiStareSeedDirektorije(direktorijiAktivni);
    } catch (greskaCiscenja) {
      console.warn("Nije moguće ukloniti stare direktorije seed PDF datoteka:", greskaCiscenja);
    }

    console.log("\nSeed gotov:");
    console.log(`  Studenata: ${STUDENTI.length}`);
    console.log("  Termina: 60 (15 tjedana × 4 grupe)");
    console.log("  Zadaci: Z1 Rekurzija, Z2 Vezane liste, Z3 Binarna stabla, Z4 Projekt (skica)");
    console.log("  Z1: 24 prihvaćene predaje, od toga 2 zakašnjele");
    console.log("  Z2: 8 prihvaćenih, 6 vraćenih, 7 u pregledu, 3 bez predaje");
    console.log("  Z3: samo grupe V1 i V2, rok za 3 dana, bez početnih predaja");
    console.log("  PDF datoteke: spremljene u DATOTEKE_DIR/seed/");
    console.log("\nRačuni (lozinka = SEED_LOZINKA iz .env):");
    console.log("  admin@unipu.test (admin)");
    console.log("  marko.peric@unipu.test (nastavnik)");
    console.log("  ivana.juric@unipu.test (asistentica V2, V3)");
    console.log("  tomislav.kos@unipu.test (asistent V1)");
    console.log("  ivan.horvat@student.unipu.test (student A, V1)");
    console.log("  klara.saric@student.unipu.test (student B, V3)");
  } catch (greska) {
    if (direktoriji && !transakcijaPotvrdjena) {
      try {
        await obrisiRunDirektorij(direktoriji);
      } catch (greskaCiscenja) {
        console.error("Nije moguće ukloniti privremene seed datoteke:", greskaCiscenja);
      }
    }
    throw greska;
  } finally {
    await db.destroy();
  }
}

main().catch((greska: unknown) => {
  console.error("Seed nije uspio:", greska);
  process.exitCode = 1;
});