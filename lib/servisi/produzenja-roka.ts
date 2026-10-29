
import type { Selectable } from "kysely";

import type { Tx } from "@/lib/db/klijent";
import type { ProduzenjeRoka } from "@/lib/db/tipovi";

export type ProduzenjeRokaZadatka = Pick<
  Selectable<ProduzenjeRoka>,
  | "student_id"
  | "novi_rok"
  | "razlog"
  | "odobrio"
  | "created_at"
>;

export type PodaciProduzenjaRoka = {
  zadatak_id: string;
  student_id: string;
  novi_rok: Date;
  razlog: string | null;
  odobrio: string;
};

/**
 * Vraća sva pojedinačna produljenja roka za zadatak.
 *
 * Pristup ograničava RLS: student vidi samo vlastito
 * produljenje, a osoblje podatke svojeg kolegija.
 */
export async function produzenjaRokaZadatka(
  tx: Tx,
  zadatakId: string,
): Promise<ProduzenjeRokaZadatka[]> {
  return tx
    .selectFrom("produzenje_roka")
    .select([
      "student_id",
      "novi_rok",
      "razlog",
      "odobrio",
      "created_at",
    ])
    .where("zadatak_id", "=", zadatakId)
    .orderBy("student_id")
    .execute();
}

/**
 * Stvara ili ažurira produljenje za određenog studenta.
 *
 * Kombinirani primarni ključ zadatka i studenta omogućuje
 * najviše jedno aktivno produljenje po studentu i zadatku.
 */
export async function spremiProduzenjeRoka(
  tx: Tx,
  podaci: PodaciProduzenjaRoka,
): Promise<void> {
  await tx
    .insertInto("produzenje_roka")
    .values({
      zadatak_id: podaci.zadatak_id,
      student_id: podaci.student_id,
      novi_rok: podaci.novi_rok,
      razlog: podaci.razlog,
      odobrio: podaci.odobrio,
    })
    .onConflict((oc) =>
      oc
        .columns(["zadatak_id", "student_id"])
        .doUpdateSet({
          novi_rok: podaci.novi_rok,
          razlog: podaci.razlog,
          odobrio: podaci.odobrio,
        }),
    )
    .execute();
}

/**
 * Uklanja pojedinačno produljenje roka.
 *
 * Nakon brisanja ponovno vrijedi izvorni rok zadatka.
 */
export async function ukloniProduzenjeRoka(
  tx: Tx,
  zadatakId: string,
  studentId: string,
): Promise<void> {
  await tx
    .deleteFrom("produzenje_roka")
    .where("zadatak_id", "=", zadatakId)
    .where("student_id", "=", studentId)
    .execute();
}