
import { sql } from "kysely";

import type { Tx } from "@/lib/db/klijent";
import type { StatusPredaje } from "@/lib/db/tipovi";

export type DatotekaVerzijePredaje = {
  id: string;
  naziv: string;
  velicina: string;
  mime: string;
  created_at: Date;
};

export type VerzijaPredajeZaPregled = {
  verzija_id: string;
  broj: number;
  tekst: string | null;
  link: string | null;
  predano_at: Date;
  rok_verzije: Date | null;
  kasni: boolean;
  rok_verzije_prosao: boolean;
  odluka: string | null;
  komentar: string | null;
  bodovi: string | null;
  rok_dorade: Date | null;
  rok_dorade_prosao: boolean;
  povratna_at: Date | null;
  autor_id: string | null;
  datoteke: DatotekaVerzijePredaje[];
};

export type DetaljPregledaPredaje = {
  predaja_id: string;
  student_id: string;
  jmbag: string;
  ime: string;
  prezime: string;
  zadatak_id: string;
  naslov: string;
  opis: string;
  izvorni_rok: Date;
  rok: Date | null;
  rok_prosao: boolean;
  kasni: boolean;
  status: StatusPredaje;
  trenutna_verzija: number;
  bodovi: string | null;
  pregledava: string | null;
  pregledava_ime: string | null;
  pregledava_prezime: string | null;
  max_bodova: string;
  nacini_predaje: string[];
  dopusti_kasnu_predaju: boolean;
  ima_produljenje: boolean;
  predano_at: Date | null;
  verzije: VerzijaPredajeZaPregled[];
};

/**
 * Dohvaća detalje predaje za pregled nastavnika ili asistenta.
 *
 * Sva čitanja ostaju unutar RLS konteksta prijavljenog korisnika.
 * Pristup studentu i njegovoj predaji određuje private.vidi_studenta.
 * RLS na tablici osoblje omogućuje prikaz drugih članova osoblja
 * koji pripadaju istom kolegiju.
 */
export async function pregledPredaje(
  tx: Tx,
  kolegijId: string,
  zadatakId: string,
  predajaId: string,
): Promise<DetaljPregledaPredaje | null> {
  // 1. Osnovni podaci o predaji, studentu, zadatku i pregledavatelju.
  const osnovniPodaci = await tx
    .selectFrom("v_predaja as vp")
    .innerJoin("zadatak as z", "z.id", "vp.zadatak_id")
    .innerJoin("student as s", "s.id", "vp.student_id")
    .leftJoin("osoblje as o", "o.korisnik_id", "vp.pregledava")
    .select((eb) => [
      eb.ref("vp.predaja_id").$notNull().as("predaja_id"),
      eb.ref("vp.student_id").$notNull().as("student_id"),
      "s.jmbag",
      "s.ime",
      "s.prezime",
      "z.id as zadatak_id",
      "z.naslov",
      "z.opis",
      "z.rok as izvorni_rok",
      "vp.rok",
      sql<boolean>`
        coalesce(vp.rok_prosao, false)
      `.as("rok_prosao"),
      sql<boolean>`
        coalesce(vp.kasni, false)
      `.as("kasni"),
      sql<StatusPredaje>`
        coalesce(vp.status::text, 'nije_predano')
      `.as("status"),
      sql<number>`
        coalesce(vp.trenutna_verzija, 0)
      `.as("trenutna_verzija"),
      sql<string | null>`vp.bodovi::text`.as("bodovi"),
      "vp.pregledava",
      "o.ime as pregledava_ime",
      "o.prezime as pregledava_prezime",
      sql<string>`z.max_bodova::text`.as("max_bodova"),
      "z.nacini_predaje",
      "z.dopusti_kasnu_predaju",
      sql<boolean>`
        coalesce(vp.rok <> z.rok, false)
      `.as("ima_produljenje"),
      "vp.predano_at",
    ])
    .where("vp.kolegij_id", "=", kolegijId)
    .where("vp.zadatak_id", "=", zadatakId)
    .where("vp.predaja_id", "=", predajaId)
    .where("z.objavljen_at", "is not", null)
    .executeTakeFirst();

  if (!osnovniPodaci) {
    return null;
  }

  // 2. Sve verzije i povratne informacije nastavnika.
  const verzije = await tx
    .selectFrom("v_predaja_verzija as vv")
    .leftJoin("povratna_informacija as pi", (join) =>
      join
        .onRef("pi.predaja_id", "=", "vv.predaja_id")
        .onRef("pi.verzija_broj", "=", "vv.broj"),
    )
    .select((eb) => [
      eb.ref("vv.verzija_id").$notNull().as("verzija_id"),
      eb.ref("vv.broj").$notNull().as("broj"),
      eb.ref("vv.predano_at").$notNull().as("predano_at"),
      "vv.tekst",
      "vv.link",
      "vv.rok_verzije",
      sql<boolean>`
        coalesce(vv.kasni, false)
      `.as("kasni"),
      sql<boolean>`
        coalesce(now() > vv.rok_verzije, false)
      `.as("rok_verzije_prosao"),
      "pi.odluka",
      "pi.komentar",
      sql<string | null>`pi.bodovi::text`.as("bodovi"),
      "pi.rok_dorade",
      sql<boolean>`
        coalesce(now() > pi.rok_dorade, false)
      `.as("rok_dorade_prosao"),
      "pi.created_at as povratna_at",
      "pi.autor_id",
    ])
    .where("vv.predaja_id", "=", predajaId)
    .where("vv.verzija_id", "is not", null)
    .where("vv.broj", "is not", null)
    .where("vv.predano_at", "is not", null)
    .orderBy("vv.broj", "desc")
    .execute();

  // 3. Datoteke povezane sa svakom verzijom.
  const datoteke = await tx
    .selectFrom("predaja_datoteka as pd")
    .innerJoin("predaja_verzija as pv", "pv.id", "pd.verzija_id")
    .innerJoin("datoteka as d", "d.id", "pd.datoteka_id")
    .select([
      "pv.broj",
      "d.id",
      "d.naziv",
      sql<string>`d.velicina::text`.as("velicina"),
      "d.mime",
      "d.created_at",
    ])
    .where("pv.predaja_id", "=", predajaId)
    .orderBy("pv.broj", "desc")
    .orderBy("d.created_at", "asc")
    .orderBy("d.naziv", "asc")
    .execute();

  // Grupiramo datoteke prema broju verzije.
  const datotekePoVerziji = new Map<
    number,
    DatotekaVerzijePredaje[]
  >();

  for (const datoteka of datoteke) {
    const { broj, ...detalji } = datoteka;
    const trenutne = datotekePoVerziji.get(broj) ?? [];

    trenutne.push(detalji);
    datotekePoVerziji.set(broj, trenutne);
  }

  // Povezujemo datoteke sa odgovarajućim verzijama.
  const verzijeSaDatotekama = verzije.map((verzija) => ({
    ...verzija,
    datoteke: datotekePoVerziji.get(verzija.broj) ?? [],
  }));

  return {
    ...osnovniPodaci,
    verzije: verzijeSaDatotekama,
  };
}

/**
 * Vraća ID sljedeće predaje koja čeka pregled.
 *
 * Predaje se obrađuju redoslijedom zaprimanja:
 * najstarija predana predaja dolazi prva.
 *
 * RLS na pogledu v_predaja osigurava da asistent
 * vidi samo predaje studenata svojih grupa.
 */
export async function sljedecaPredajaZaPregled(
  tx: Tx,
  kolegijId: string,
  zadatakId: string,
  trenutnaPredajaId: string,
): Promise<string | null> {
  const rezultat = await tx
    .selectFrom("v_predaja as vp")
    .select("vp.predaja_id")
    .where("vp.kolegij_id", "=", kolegijId)
    .where("vp.zadatak_id", "=", zadatakId)
    .where("vp.predaja_id", "!=", trenutnaPredajaId)
    .where("vp.status", "=", "predano")
    .orderBy("vp.predano_at", "asc")
    .orderBy("vp.predaja_id", "asc")
    .limit(1)
    .executeTakeFirst();

  return rezultat?.predaja_id ?? null;
}