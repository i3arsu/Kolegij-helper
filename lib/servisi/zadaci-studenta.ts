import type { Tx } from "@/lib/db/klijent";
import { priloziZadatka } from "@/lib/servisi/prilozi-zadatka";
import { sql } from "kysely";

/**
 * Rok koji vrijedi za sljedeću predaju.
 * Za doradu koristi rok iz povratne informacije nastavnika.
 */
function rokZaPredajuSql() {
  return sql<Date | null>`
    CASE
      WHEN vp.status = 'vraceno_na_doradu'
        THEN pi.rok_dorade
      ELSE vp.rok
    END
  `;
}

/**
 * Zadaci dostupni studentu na kolegiju.
 * V_predaja osigurava da se prikazuju samo dodijeljeni zadaci.
 */
export async function zadaciStudenta(
  tx: Tx,
  kolegijId: string,
  studentId: string,
) {
  const rok = rokZaPredajuSql();

  return tx
    .selectFrom("v_predaja as vp")
    .innerJoin("zadatak as z", "z.id", "vp.zadatak_id")
    .leftJoin("v_predaja_verzija as vv", (join) =>
      join
        .onRef("vv.predaja_id", "=", "vp.predaja_id")
        .onRef("vv.broj", "=", "vp.trenutna_verzija"),
    )
    .leftJoin("povratna_informacija as pi", (join) =>
      join
        .onRef("pi.predaja_id", "=", "vv.predaja_id")
        .onRef("pi.verzija_broj", "=", "vv.broj"),
    )
    .select([
      "z.id",
      "z.naslov",
      "z.rok as izvorni_rok",
      "z.max_bodova",
      "z.nacini_predaje",
      "z.dopusti_kasnu_predaju",
      "vp.predaja_id",
      "vp.status",
      "vp.bodovi",
      "vp.predano_at",
      rok.as("rok_efektivni"),
      sql<boolean>`
        coalesce(now() > ${rok}, false)
      `.as("rok_prosao"),
      "vp.kasni",
      "vp.trenutna_verzija",
    ])
    .where("vp.kolegij_id", "=", kolegijId)
    .where("vp.student_id", "=", studentId)
    .where("z.objavljen_at", "is not", null)
    .orderBy(rok, "asc")
    .execute();
}


/**
 * Sljedeći rokovi za predaju zadataka.
 * Uključuje nepredane zadatke i zadatke vraćene na doradu.
 * Za doradu se koristi rok iz povratne informacije nastavnika.
 */
/**
 * Sljedeći rokovi za predaju zadataka.
 * Uključuje zakašnjele predaje koje su još dopuštene
 * i dorade bez postavljenog roka.
 */
export async function sljedeciRokoviStudenta(
  tx: Tx,
  kolegijId: string,
  studentId: string,
) {
  const rok = rokZaPredajuSql();

  return tx
    .selectFrom("v_predaja as vp")
    .innerJoin("zadatak as z", "z.id", "vp.zadatak_id")
    .leftJoin("v_predaja_verzija as vv", (join) =>
      join
        .onRef("vv.predaja_id", "=", "vp.predaja_id")
        .onRef("vv.broj", "=", "vp.trenutna_verzija"),
    )
    .leftJoin("povratna_informacija as pi", (join) =>
      join
        .onRef("pi.predaja_id", "=", "vv.predaja_id")
        .onRef("pi.verzija_broj", "=", "vv.broj"),
    )
    .select([
      "z.id as zadatak_id",
      "z.naslov",
      "vp.status",
      rok.as("rok_za_predaju"),
      sql<boolean>`
        coalesce(now() > ${rok}, false)
      `.as("rok_prosao"),
    ])
    .where("vp.kolegij_id", "=", kolegijId)
    .where("vp.student_id", "=", studentId)
    .where("z.objavljen_at", "is not", null)
    .where("vp.status", "in", [
      "nije_predano",
      "vraceno_na_doradu",
    ])
    .where(sql<boolean>`
      (
        ${rok} IS NULL
        OR ${rok} > now()
        OR z.dopusti_kasnu_predaju = true
      )
    `)
    .orderBy(rok, "asc")
    .limit(5)
    .execute();
}


/**
 * Últimas povratne informacije nastavnika za studenta.
 * Prikazuje najnovije komentare i ocjene svih predanih verzija.
 */
export async function zadnjePovratneInformacije(
  tx: Tx,
  kolegijId: string,
  studentId: string,
) {
  return tx
    .selectFrom("v_predaja as vp")
    .innerJoin("zadatak as z", "z.id", "vp.zadatak_id")
    .innerJoin("v_predaja_verzija as vv", "vv.predaja_id", "vp.predaja_id")
    .innerJoin("povratna_informacija as pi", (join) =>
      join
        .onRef("pi.predaja_id", "=", "vv.predaja_id")
        .onRef("pi.verzija_broj", "=", "vv.broj"),
    )
    .select([
      "z.id as zadatak_id",
      "z.naslov",
      "vv.broj as verzija",
      "pi.odluka",
      "pi.komentar",
      "pi.bodovi",
      "pi.rok_dorade",
      "pi.created_at as povratna_at",
    ])
    .where("vp.kolegij_id", "=", kolegijId)
    .where("vp.student_id", "=", studentId)
    .where("z.objavljen_at", "is not", null)
    .orderBy("pi.created_at", "desc")
    .limit(5)
    .execute();
}

/**
 * Detalji zadatka i prilozi dostupni studentu.
 */
export async function zadatakStudenta(
  tx: Tx,
  kolegijId: string,
  studentId: string,
  zadatakId: string,
) {
  const zadatak = await tx
    .selectFrom("v_predaja as vp")
    .innerJoin("zadatak as z", "z.id", "vp.zadatak_id")
    .select([
      "z.id",
      "z.naslov",
      "z.opis",
      "z.rok as izvorni_rok",
      "z.max_bodova",
      "z.nacini_predaje",
      "z.dopusti_kasnu_predaju",
      "vp.predaja_id",
      "vp.status",
      "vp.bodovi",
      "vp.predano_at",
      "vp.rok as rok_efektivni",
      "vp.rok_prosao",
      "vp.kasni",
      "vp.trenutna_verzija",
    ])
    .where("vp.kolegij_id", "=", kolegijId)
    .where("vp.student_id", "=", studentId)
    .where("vp.zadatak_id", "=", zadatakId)
    .where("z.objavljen_at", "is not", null)
    .executeTakeFirst();

  if (!zadatak) {
    return null;
  }

  const prilozi = await priloziZadatka(tx, zadatakId);

  return {
    ...zadatak,
    prilozi,
  };
}

/**
 * Povijest svih predanih verzija s povratnim informacijama
 * i datotekama pojedine verzije.
 */
export async function povijestPredaje(
  tx: Tx,
  kolegijId: string,
  studentId: string,
  zadatakId: string,
) {
  const predaja = await tx
    .selectFrom("v_predaja as vp")
    .select("vp.predaja_id")
    .where("vp.kolegij_id", "=", kolegijId)
    .where("vp.student_id", "=", studentId)
    .where("vp.zadatak_id", "=", zadatakId)
    .executeTakeFirst();

  if (!predaja?.predaja_id) {
    return [];
  }

  const verzije = await tx
    .selectFrom("v_predaja_verzija as vv")
    .leftJoin("povratna_informacija as pi", (join) =>
      join
        .onRef("pi.predaja_id", "=", "vv.predaja_id")
        .onRef("pi.verzija_broj", "=", "vv.broj"),
    )
    .select([
        "vv.verzija_id",
        "vv.broj",
        "vv.tekst",
        "vv.link",
        "vv.predano_at",
        "vv.rok_verzije",
        "vv.kasni",

    sql<boolean>`
        coalesce(now() > vv.rok_verzije, false)
        `.as("rok_verzije_prosao"),

        "pi.odluka",
        "pi.komentar",
        "pi.bodovi",
        "pi.rok_dorade",
        "pi.created_at as povratna_at",

        sql<boolean>`
        coalesce(now() > pi.rok_dorade, false)
        `.as("rok_dorade_prosao"),
    ])
    .where("vv.predaja_id", "=", predaja.predaja_id)
    .orderBy("vv.broj", "asc")
    .execute();

  const datoteke = await tx
    .selectFrom("predaja_datoteka as pd")
    .innerJoin("predaja_verzija as pv", "pv.id", "pd.verzija_id")
    .innerJoin("datoteka as d", "d.id", "pd.datoteka_id")
    .select([
      "pv.broj",
      "d.id",
      "d.naziv",
      "d.velicina",
      "d.mime",
      "d.created_at",
    ])
    .where("pv.predaja_id", "=", predaja.predaja_id)
    .orderBy("d.created_at", "asc")
    .execute();

  return verzije.map((verzija) => ({
    ...verzija,
    datoteke: datoteke.filter(
      (datoteka) => datoteka.broj === verzija.broj,
    ),
  }));
}