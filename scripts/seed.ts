/**
 * Razvojni seed: kolegij "Programiranje 2", grupe P1 i V1–V3, 25 izmišljenih studenata,
 * 15 tjedana termina (semestar počeo prije 6 tjedana) s realističnom dolaznošću.
 * Svi računi dobivaju lozinku SEED_LOZINKA iz .env. Briše postojeće podatke!
 *
 *   npm run seed
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { TZDate } from "@date-fns/tz";
import { addDays, format, startOfWeek } from "date-fns";
import { sql } from "kysely";
import { napraviBazu } from "../lib/db/klijent";
import { hashLozinke } from "../lib/auth/lozinka";
import { lokalnoUTrenutak, ZONA } from "../lib/domena/vrijeme";

if (process.env.NODE_ENV === "production") {
  console.error("Seed se ne smije pokretati u produkciji.");
  process.exit(1);
}
const LOZINKA = process.env.SEED_LOZINKA;
const URL = process.env.OWNER_DATABASE_URL;
if (!LOZINKA || !URL) {
  console.error("Postavite SEED_LOZINKA i OWNER_DATABASE_URL u .env");
  process.exit(1);
}

// Deterministički PRNG (mulberry32) da seed uvijek daje iste podatke.
let stanje = 42;
function slucajno() {
  stanje = (stanje + 0x6d2b79f5) | 0;
  let t = Math.imul(stanje ^ (stanje >>> 15), 1 | stanje);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const STUDENTI: [string, string][] = [
  ["Ivan", "Horvat"], ["Ana", "Kovačević"], ["Luka", "Babić"], ["Petra", "Marić"], ["Marko", "Jurić"],
  ["Lucija", "Novak"], ["Matej", "Knežević"], ["Ema", "Vuković"], ["Filip", "Marković"], ["Sara", "Petrović"],
  ["Josip", "Matić"], ["Mia", "Tomić"], ["Karlo", "Pavlović"], ["Lana", "Božić"], ["David", "Kovač"],
  ["Iva", "Grgić"], ["Antonio", "Blažević"], ["Klara", "Šarić"], ["Ivan", "Horvat"], ["Nika", "Đurić"],
  ["Toni", "Radić"], ["Dora", "Perković"], ["Fran", "Lovrić"], ["Ena", "Čolić"], ["Leon", "Žagar"],
];
// Indeksi s posebnim ulogama u scenariju
const GRANICNI = new Set([3, 9, 14, 21]); // ~75 %
const ISPOD_PRAGA = new Set([6, 16, 23]); // ~45 %
const PREMJESTEN = 12; // V2 -> V3 u 4. tjednu
const ISPISAN = 24;
const MORA_PROMIJENITI = 5;
const GOST = 1; // student iz V1 dolazi na V2 u 2. tjednu

const TEME_P = [
  "Uvod i ponavljanje", "Pokazivači", "Dinamička memorija", "Strukture", "Vezane liste", "Stog i red",
  "Rekurzija", "Stabla", "Binarna stabla pretraživanja", "Hash tablice", "Sortiranje", "Datoteke",
  "Modularno programiranje", "Testiranje", "Ponavljanje",
];

function ascii(s: string) {
  return s.toLowerCase().replaceAll("đ", "d").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

async function main() {
  const db = napraviBazu(URL!, 2);
  const hash = await hashLozinke(LOZINKA!);

  await sql`truncate korisnik, kolegij, sesija, prijava_pokusaj, revizija restart identity cascade`.execute(db);

  // Osoblje
  const noviKorisnik = async (email: string, opcije: { admin?: boolean; mora?: boolean } = {}) =>
    (await db.insertInto("korisnik")
      .values({ email, lozinka_hash: hash, je_admin: opcije.admin ?? false, mora_promijeniti_lozinku: opcije.mora ?? false })
      .returning("id").executeTakeFirstOrThrow()).id;
  const novoOsoblje = async (email: string, ime: string, prezime: string, titula: string | null) =>
    (await db.insertInto("osoblje").values({ korisnik_id: await noviKorisnik(email), ime, prezime, titula })
      .returning("id").executeTakeFirstOrThrow()).id;

  await noviKorisnik("admin@unipu.test", { admin: true });
  const peric = await novoOsoblje("marko.peric@unipu.test", "Marko", "Perić", "doc. dr. sc.");
  const juric = await novoOsoblje("ivana.juric@unipu.test", "Ivana", "Jurić", "mag. inf.");
  const kos = await novoOsoblje("tomislav.kos@unipu.test", "Tomislav", "Kos", "mag. inf.");

  // Kolegij i grupe
  const kolegij = (await db.insertInto("kolegij")
    .values({ naziv: "Programiranje 2", sifra: "PRG2", akademska_godina: "2026/2027", semestar: "zimski" })
    .returning("id").executeTakeFirstOrThrow()).id;
  await db.updateTable("pravila_prolaza")
    .set({ min_dolaznost_predavanja: 50, min_dolaznost_vjezbi: 75, min_bodova: 50 })
    .where("kolegij_id", "=", kolegij).execute();
  await db.insertInto("osoblje_kolegija").values([
    { kolegij_id: kolegij, osoblje_id: peric, uloga: "nastavnik" },
    { kolegij_id: kolegij, osoblje_id: juric, uloga: "asistent" },
    { kolegij_id: kolegij, osoblje_id: kos, uloga: "asistent" },
  ]).execute();
  const grupa: Record<string, string> = {};
  for (const [naziv, tip] of [["P1", "predavanje"], ["V1", "vjezbe"], ["V2", "vjezbe"], ["V3", "vjezbe"]] as const) {
    grupa[naziv] = (await db.insertInto("grupa").values({ kolegij_id: kolegij, naziv, tip }).returning("id").executeTakeFirstOrThrow()).id;
  }
  await db.insertInto("asistent_grupa").values([
    { grupa_id: grupa.V1, osoblje_id: kos },
    { grupa_id: grupa.V2, osoblje_id: juric },
    { grupa_id: grupa.V3, osoblje_id: juric },
  ]).execute();

  // Termini: tjedan 0 počinje ponedjeljak prije 6 tjedana
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
    for (const r of raspored) {
      const datum = format(addDays(pocetakSemestra, tjedan * 7 + r.dan), "yyyy-MM-dd");
      const pocetak = lokalnoUTrenutak(datum, r.od);
      const t = await db.insertInto("termin").values({
        kolegij_id: kolegij, grupa_id: grupa[r.g], pocetak, kraj: lokalnoUTrenutak(datum, r.do),
        tema: r.g === "P1" ? TEME_P[tjedan] : `Vježbe: ${TEME_P[tjedan].toLowerCase()}`,
        otkazan: r.g === "V2" && tjedan === 3,
      }).returning("id").executeTakeFirstOrThrow();
      termini.push({ id: t.id, g: r.g, tjedan, pocetak });
    }
  }
  const pocetakTjedna4 = lokalnoUTrenutak(format(addDays(pocetakSemestra, 28), "yyyy-MM-dd"), "00:00");

  // Studenti, upisi, članstva
  const vGrupa = (i: number) => (i < 9 ? "V1" : i < 17 ? "V2" : "V3");
  const csv: string[] = ["JMBAG;Prezime;Ime;E-mail;Grupa P;Grupa V"];
  const studenti: { id: string; i: number; v: string }[] = [];
  const vidjeniEmailovi = new Set<string>();
  for (const [i, [ime, prezime]] of STUDENTI.entries()) {
    let email = `${ascii(ime)}.${ascii(prezime)}@student.unipu.test`;
    if (vidjeniEmailovi.has(email)) email = email.replace("@", "2@");
    vidjeniEmailovi.add(email);
    const jmbag = `99${String(1000000 + i * 7919).padStart(8, "0")}`.slice(0, 10);
    const korisnik = await noviKorisnik(email, { mora: i === MORA_PROMIJENITI });
    const student = (await db.insertInto("student").values({ korisnik_id: korisnik, jmbag, ime, prezime })
      .returning("id").executeTakeFirstOrThrow()).id;
    const upis = (await db.insertInto("upis").values({ kolegij_id: kolegij, student_id: student, status: i === ISPISAN ? "ispisan" : "aktivan" })
      .returning("id").executeTakeFirstOrThrow()).id;
    const v = vGrupa(i);
    await db.insertInto("clanstvo_grupe").values({ upis_id: upis, grupa_id: grupa.P1, tip: "predavanje", vrijedi: "(,)" }).execute();
    if (i === PREMJESTEN) {
      await db.insertInto("clanstvo_grupe").values([
        { upis_id: upis, grupa_id: grupa.V2, tip: "vjezbe", vrijedi: sql`tstzrange(null, ${pocetakTjedna4})` },
        { upis_id: upis, grupa_id: grupa.V3, tip: "vjezbe", vrijedi: sql`tstzrange(${pocetakTjedna4}, null)` },
      ] as never).execute();
    } else {
      await db.insertInto("clanstvo_grupe").values({ upis_id: upis, grupa_id: grupa[v], tip: "vjezbe", vrijedi: "(,)" }).execute();
    }
    studenti.push({ id: student, i, v: i === PREMJESTEN ? "V3" : v });
    csv.push([jmbag, prezime, ime, email, "P1", i === PREMJESTEN ? "V3" : v].join(";"));
  }

  // Dolaznost za prošle termine (osim jednog namjerno neevidentiranog)
  const sada = Date.now();
  const prosli = termini.filter((t) => t.pocetak.getTime() < sada);
  const neevidentiran = [...prosli].reverse().find((t) => t.g === "V1");
  for (const t of prosli) {
    if (t.id === neevidentiran?.id) continue;
    const otkazan = t.g === "V2" && t.tjedan === 3;
    if (otkazan) continue;
    for (const s of studenti) {
      if (s.i === ISPISAN && t.tjedan > 2) continue;
      const clan =
        t.g === "P1" ||
        (s.i === PREMJESTEN ? (t.tjedan < 4 ? t.g === "V2" : t.g === "V3") : s.v === t.g);
      if (!clan) continue;
      const p = ISPOD_PRAGA.has(s.i) ? 0.45 : GRANICNI.has(s.i) ? 0.75 : 0.95;
      const x = slucajno();
      const status = x < p ? "prisutan" : x < p + 0.06 ? "opravdano" : "odsutan";
      await db.insertInto("dolazak").values({
        termin_id: t.id, student_id: s.id, status,
        napomena: status === "opravdano" ? "Liječnička ispričnica" : null,
      }).execute();
    }
    await db.updateTable("termin").set({ evidencija_spremljena_at: new Date(t.pocetak.getTime() + 90 * 60000) })
      .where("id", "=", t.id).execute();
  }
  const gostTermin = termini.find((t) => t.g === "V2" && t.tjedan === 1);
  if (gostTermin && gostTermin.pocetak.getTime() < sada) {
    await db.insertInto("dolazak").values({
      termin_id: gostTermin.id, student_id: studenti[GOST].id, status: "prisutan", gost: true, napomena: "Nadoknada",
    }).execute();
  }

  // Ogledne CSV datoteke za testiranje uvoza
  writeFileSync("db/podaci/studenti-prg2.csv", "﻿" + csv.join("\r\n") + "\r\n");
  writeFileSync(
    "db/podaci/ponovni-uvoz.csv",
    "﻿" + csv
      .map((r, i) => (i === 2 ? r.replace("Ana", "Ana Marija") : i === 4 ? r.replace("petra.maric@", "petra.maric.nova@") : i === 7 ? r.replace(/V1$/, "V2") : r))
      .concat(["9912345678;Novak;Tin;tin.novak@student.unipu.test;P1;V2"])
      .join("\r\n") + "\r\n",
  );
  writeFileSync(
    "db/podaci/studenti-s-greskama.csv",
    [
      "JMBAG,Ime,Prezime,Email,Grupa V",
      "0036512345,Marta,Kralj,marta.kralj@student.unipu.test,V1",
      "12345,Kratki,Jmbag,kratki@student.unipu.test,V1",
      "0036512346,Bez,Emaila,,V2",
      "0036512347,Kriva,Grupa,kriva.grupa@student.unipu.test,V9",
      "0036512348,Dupli,Prvi,dupli1@student.unipu.test,V1",
      "0036512348,Dupli,Drugi,dupli2@student.unipu.test,V2",
      `0036512349,Tuđi,Email,${"ana.kovacevic@student.unipu.test"},V3`,
    ].join("\n") + "\n",
  );

  console.log(`Seed gotov: ${studenti.length} studenata, ${termini.length} termina (${prosli.length} prošlih).`);
  console.log("Računi (lozinka = SEED_LOZINKA iz .env):");
  console.log("  admin@unipu.test (admin), marko.peric@unipu.test (nastavnik)");
  console.log("  ivana.juric@unipu.test (asistent V2, V3), tomislav.kos@unipu.test (asistent V1)");
  console.log("  ivan.horvat@student.unipu.test, ana.kovacevic@student.unipu.test, … (studenti)");
  await db.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
