import { sql } from "kysely";
import type { Baza } from "@/lib/db/klijent";
import { lokalnoUTrenutak } from "@/lib/domena/vrijeme";

/**
 * Mala scena za testove (postavlja je app_owner):
 *  K1: nastavnik N, asistent A (samo V1); grupe P1, V1, V2
 *      S1 (P1, V1), S2 (P1, V2)
 *  K2: nastavnik N2; S3 (samo na K2)
 *  Termini K1: P1 i V1 i V2 po jednom, evidentirani, s dolascima.
 */
export async function postaviScenu(db: Baza) {
  const korisnik = async (email: string) =>
    (await db.insertInto("korisnik").values({ email, lozinka_hash: "x", mora_promijeniti_lozinku: false })
      .returning("id").executeTakeFirstOrThrow()).id;
  const osoblje = async (email: string) => {
    const k = await korisnik(email);
    const o = await db.insertInto("osoblje").values({ korisnik_id: k, ime: "Ime", prezime: email })
      .returning("id").executeTakeFirstOrThrow();
    return { korisnik: k, osoblje: o.id };
  };
  const N = await osoblje("n@unipu.test");
  const A = await osoblje("a@unipu.test");
  const N2 = await osoblje("n2@unipu.test");

  const kolegij = async (sifra: string) =>
    (await db.insertInto("kolegij").values({ naziv: sifra, sifra, akademska_godina: "2026/2027", semestar: "zimski" })
      .returning("id").executeTakeFirstOrThrow()).id;
  const K1 = await kolegij("K1");
  const K2 = await kolegij("K2");
  await db.insertInto("osoblje_kolegija").values([
    { kolegij_id: K1, osoblje_id: N.osoblje, uloga: "nastavnik" },
    { kolegij_id: K1, osoblje_id: A.osoblje, uloga: "asistent" },
    { kolegij_id: K2, osoblje_id: N2.osoblje, uloga: "nastavnik" },
  ]).execute();

  const grupa = async (k: string, naziv: string, tip: "predavanje" | "vjezbe") =>
    (await db.insertInto("grupa").values({ kolegij_id: k, naziv, tip }).returning("id").executeTakeFirstOrThrow()).id;
  const G = { P1: await grupa(K1, "P1", "predavanje"), V1: await grupa(K1, "V1", "vjezbe"), V2: await grupa(K1, "V2", "vjezbe") };
  const GK2 = await grupa(K2, "V1", "vjezbe");
  await db.insertInto("asistent_grupa").values({ grupa_id: G.V1, osoblje_id: A.osoblje }).execute();

  const student = async (email: string, jmbag: string, upisi: [string, string[]][]) => {
    const k = await korisnik(email);
    const s = (await db.insertInto("student").values({ korisnik_id: k, jmbag, ime: "Stu", prezime: email })
      .returning("id").executeTakeFirstOrThrow()).id;
    for (const [kol, grupe] of upisi) {
      const u = (await db.insertInto("upis").values({ kolegij_id: kol, student_id: s }).returning("id").executeTakeFirstOrThrow()).id;
      for (const g of grupe) {
        await db.insertInto("clanstvo_grupe").values({ upis_id: u, grupa_id: g, tip: "x", vrijedi: "(,)" }).execute();
      }
    }
    return { korisnik: k, student: s };
  };
  const S1 = await student("s1@student.unipu.test", "0000000001", [[K1, [G.P1, G.V1]]]);
  const S2 = await student("s2@student.unipu.test", "0000000002", [[K1, [G.P1, G.V2]]]);
  const S3 = await student("s3@student.unipu.test", "0000000003", [[K2, [GK2]]]);

  const termin = async (g: string, datum: string) =>
    (await db.insertInto("termin").values({
      kolegij_id: K1, grupa_id: g, pocetak: lokalnoUTrenutak(datum, "10:00"), kraj: lokalnoUTrenutak(datum, "11:30"),
      evidencija_spremljena_at: sql<Date>`now()`,
    }).returning("id").executeTakeFirstOrThrow()).id;
  const T = { P1: await termin(G.P1, "2026-09-07"), V1: await termin(G.V1, "2026-09-08"), V2: await termin(G.V2, "2026-09-08") };
  await db.insertInto("dolazak").values([
    { termin_id: T.P1, student_id: S1.student, status: "prisutan" },
    { termin_id: T.P1, student_id: S2.student, status: "odsutan" },
    { termin_id: T.V1, student_id: S1.student, status: "prisutan" },
    { termin_id: T.V2, student_id: S2.student, status: "opravdano" },
  ]).execute();

  return { N, A, N2, K1, K2, G, GK2, S1, S2, S3, T };
}

export type Scena = Awaited<ReturnType<typeof postaviScenu>>;
