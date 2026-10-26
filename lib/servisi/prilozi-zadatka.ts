import type { Tx } from "@/lib/db/klijent";

export async function priloziZadatka(
  tx: Tx,
  zadatakId: string,
) {
  return tx
    .selectFrom("zadatak_prilog as zp")
    .innerJoin(
      "datoteka as d",
      "d.id",
      "zp.datoteka_id",
    )
    .select([
      "d.id",
      "d.naziv",
      "d.velicina",
      "d.mime",
      "d.created_at",
    ])
    .where("zp.zadatak_id", "=", zadatakId)
    .orderBy("d.created_at", "asc")
    .execute();
}