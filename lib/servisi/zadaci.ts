
import { sql } from "kysely";
import type { Tx } from "@/lib/db/klijent";
import { GreskaAplikacije } from "@/lib/http/greske";

export type NacinPredajeZadatka =
  | "datoteka"
  | "link"
  | "tekst";

export type PodaciZadatka = {
  naslov: string;
  opis: string;
  rok: Date;
  max_bodova: number;
  nacini_predaje: NacinPredajeZadatka[];
  dopusti_kasnu_predaju: boolean;
  za_cijeli_kolegij: boolean;
  grupaIds: string[];
};

type GrupaZadatka = {
  id: string;
  naziv: string;
  tip: "predavanje" | "vjezbe";
};

export async function zadaciKolegija(
  tx: Tx,
  kolegijId: string,
) {
  const { rows } = await sql<{
    id: string;
    naslov: string;
    opis: string;
    rok: Date;
    max_bodova: string;
    nacini_predaje: string[];
    dopusti_kasnu_predaju: boolean;
    za_cijeli_kolegij: boolean;
    objavljen_at: Date | null;
    created_at: Date;
    grupe: GrupaZadatka[];
    nije_predano: number;
    predano: number;
    u_pregledu: number;
    vraceno_na_doradu: number;
    prihvaceno: number;
  }>`
    select
      z.id,
      z.naslov,
      z.opis,
      z.rok,
      z.max_bodova::text as max_bodova,
      z.nacini_predaje,
      z.dopusti_kasnu_predaju,
      z.za_cijeli_kolegij,
      z.objavljen_at,
      z.created_at,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', g.id,
              'naziv', g.naziv,
              'tip', g.tip::text
            )
            order by g.tip, g.naziv
          )
          from zadatak_grupa zg
          join grupa g on g.id = zg.grupa_id
          where zg.zadatak_id = z.id
        ),
        '[]'::jsonb
      ) as grupe,
      count(vp.student_id)
        filter (where vp.status = 'nije_predano')::int
        as nije_predano,
      count(vp.student_id)
        filter (where vp.status = 'predano')::int
        as predano,
      count(vp.student_id)
        filter (where vp.status = 'u_pregledu')::int
        as u_pregledu,
      count(vp.student_id)
        filter (where vp.status = 'vraceno_na_doradu')::int
        as vraceno_na_doradu,
      count(vp.student_id)
        filter (where vp.status = 'prihvaceno')::int
        as prihvaceno
    from zadatak z
    left join v_predaja vp on vp.zadatak_id = z.id
    where z.kolegij_id = ${kolegijId}
    group by z.id
    order by
      (z.objavljen_at is null) desc,
      z.rok asc,
      z.created_at desc
  `.execute(tx);

  return rows;
}

export async function zadatakKolegija(
  tx: Tx,
  kolegijId: string,
  zadatakId: string,
) {
  const zadatak = await tx
    .selectFrom("zadatak")
    .select([
      "id",
      "kolegij_id",
      "naslov",
      "opis",
      "rok",
      "max_bodova",
      "nacini_predaje",
      "dopusti_kasnu_predaju",
      "za_cijeli_kolegij",
      "objavljen_at",
      "created_at",
      "updated_at",
    ])
    .where("id", "=", zadatakId)
    .where("kolegij_id", "=", kolegijId)
    .executeTakeFirst();

  if (!zadatak) return null;

  const grupe = await tx
    .selectFrom("zadatak_grupa as zg")
    .innerJoin("grupa as g", "g.id", "zg.grupa_id")
    .select(["g.id", "g.naziv", "g.tip"])
    .where("zg.zadatak_id", "=", zadatakId)
    .orderBy("g.tip")
    .orderBy("g.naziv")
    .execute();

  return { ...zadatak, grupe };
}

async function provjeriGrupe(
  tx: Tx,
  kolegijId: string,
  zaCijeliKolegij: boolean,
  grupaIds: string[],
) {
  if (zaCijeliKolegij) return [];

  const jedinstveniIds = [...new Set(grupaIds)];

  if (jedinstveniIds.length === 0) {
    throw new GreskaAplikacije("assignmentGroupsRequired");
  }

  const grupe = await tx
    .selectFrom("grupa")
    .select("id")
    .where("kolegij_id", "=", kolegijId)
    .where("id", "in", jedinstveniIds)
    .execute();

  if (grupe.length !== jedinstveniIds.length) {
    throw new GreskaAplikacije("invalidAssignmentGroups");
  }

  return jedinstveniIds;
}

async function zamijeniGrupe(
  tx: Tx,
  zadatakId: string,
  grupaIds: string[],
) {
  await tx
    .deleteFrom("zadatak_grupa")
    .where("zadatak_id", "=", zadatakId)
    .execute();

  if (grupaIds.length === 0) return;

  await tx
    .insertInto("zadatak_grupa")
    .values(
      grupaIds.map((grupa_id) => ({
        zadatak_id: zadatakId,
        grupa_id,
      })),
    )
    .execute();
}

export async function kreirajZadatak(
  tx: Tx,
  kolegijId: string,
  p: PodaciZadatka,
) {
  const grupaIds = await provjeriGrupe(
    tx,
    kolegijId,
    p.za_cijeli_kolegij,
    p.grupaIds,
  );

  const zadatak = await tx
    .insertInto("zadatak")
    .values({
      kolegij_id: kolegijId,
      naslov: p.naslov.trim(),
      opis: p.opis.trim(),
      rok: p.rok,
      max_bodova: p.max_bodova,
      nacini_predaje: p.nacini_predaje,
      dopusti_kasnu_predaju: p.dopusti_kasnu_predaju,
      za_cijeli_kolegij: p.za_cijeli_kolegij,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  await zamijeniGrupe(tx, zadatak.id, grupaIds);

  return zadatak.id;
}

export async function urediZadatak(
  tx: Tx,
  kolegijId: string,
  zadatakId: string,
  p: PodaciZadatka,
) {
  const grupaIds = await provjeriGrupe(
    tx,
    kolegijId,
    p.za_cijeli_kolegij,
    p.grupaIds,
  );

  const rezultat = await tx
    .updateTable("zadatak")
    .set({
      naslov: p.naslov.trim(),
      opis: p.opis.trim(),
      rok: p.rok,
      max_bodova: p.max_bodova,
      nacini_predaje: p.nacini_predaje,
      dopusti_kasnu_predaju: p.dopusti_kasnu_predaju,
      za_cijeli_kolegij: p.za_cijeli_kolegij,
    })
    .where("id", "=", zadatakId)
    .where("kolegij_id", "=", kolegijId)
    .executeTakeFirst();

  if (Number(rezultat.numUpdatedRows) === 0) {
    throw new GreskaAplikacije("assignmentNotFound");
  }

  await zamijeniGrupe(tx, zadatakId, grupaIds);
}

export async function objaviZadatak(
  tx: Tx,
  kolegijId: string,
  zadatakId: string,
) {
  const zadatak = await tx
    .selectFrom("zadatak")
    .select(["objavljen_at", "za_cijeli_kolegij"])
    .where("id", "=", zadatakId)
    .where("kolegij_id", "=", kolegijId)
    .executeTakeFirst();

  if (!zadatak) {
    throw new GreskaAplikacije("assignmentNotFound");
  }

  if (zadatak.objavljen_at !== null) {
    throw new GreskaAplikacije("assignmentAlreadyPublished");
  }

  if (!zadatak.za_cijeli_kolegij) {
    const grupe = await tx
      .selectFrom("zadatak_grupa")
      .select("grupa_id")
      .where("zadatak_id", "=", zadatakId)
      .execute();

    if (grupe.length === 0) {
      throw new GreskaAplikacije("assignmentGroupsRequired");
    }
  }

  const rezultat = await tx
    .updateTable("zadatak")
    .set({ objavljen_at: sql<Date>`now()` })
    .where("id", "=", zadatakId)
    .where("kolegij_id", "=", kolegijId)
    .where("objavljen_at", "is", null)
    .executeTakeFirst();

  if (Number(rezultat.numUpdatedRows) === 0) {
    throw new GreskaAplikacije("assignmentAlreadyPublished");
  }
}