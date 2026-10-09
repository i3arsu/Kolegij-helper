import { sql } from "kysely";
import type { Tx } from "@/lib/db/klijent";

/** Podaci za studentski dashboard. RLS osigurava da student vidi samo sebe. */
export async function mojPregled(tx: Tx, kolegijId: string, studentId: string) {
  const dolaznost = await tx
    .selectFrom("v_dolaznost")
    .select(["tip", "odrzano", "prisutan", "opravdano", "odsutan", "postotak", "prag"])
    .where("kolegij_id", "=", kolegijId)
    .where("student_id", "=", studentId)
    .execute();
  const pravila = await tx
    .selectFrom("pravila_prolaza")
    .select(["min_dolaznost_predavanja", "min_dolaznost_vjezbi", "opravdano_se_racuna"])
    .where("kolegij_id", "=", kolegijId)
    .executeTakeFirst();
  const { rows: grupe } = await sql<{ naziv: string; tip: string }>`
    select g.naziv, cg.tip from clanstvo_grupe cg
    join upis u on u.id = cg.upis_id join grupa g on g.id = cg.grupa_id
    where u.kolegij_id = ${kolegijId} and u.student_id = ${studentId} and upper_inf(cg.vrijedi)
    order by cg.tip`.execute(tx);
  const sljedeci = await tx
    .selectFrom("termin as t")
    .innerJoin("grupa as g", "g.id", "t.grupa_id")
    .select(["t.id", "t.pocetak", "t.kraj", "t.tema", "g.naziv as grupa"])
    .where("t.kolegij_id", "=", kolegijId)
    .where("t.otkazan", "=", false)
    .where("t.pocetak", ">=", sql<Date>`now()`)
    .where((eb) =>
      eb.exists(
        eb.selectFrom("clanstvo_grupe as cg")
          .innerJoin("upis as u", "u.id", "cg.upis_id")
          .whereRef("cg.grupa_id", "=", "t.grupa_id")
          .where("u.student_id", "=", studentId)
          .where(sql<boolean>`upper_inf(cg.vrijedi)`),
      ),
    )
    .orderBy("t.pocetak")
    .limit(5)
    .execute();
  return { dolaznost, pravila, grupe, sljedeci };
}
