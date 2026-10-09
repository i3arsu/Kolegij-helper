import { sql } from "kysely";
import type { Tx } from "@/lib/db/klijent";

export async function sazetakKolegija(tx: Tx, kolegijId: string) {
  const { rows } = await sql<{
    broj_studenata: number;
    prosjek_p: number | null;
    prosjek_v: number | null;
    ispod_p: number;
    ispod_v: number;
  }>`
    select
      (select count(*)::int from upis u where u.kolegij_id = ${kolegijId} and u.status = 'aktivan') as broj_studenata,
      (select round(avg(postotak), 1)::float8 from v_dolaznost where kolegij_id = ${kolegijId} and tip = 'predavanje') as prosjek_p,
      (select round(avg(postotak), 1)::float8 from v_dolaznost where kolegij_id = ${kolegijId} and tip = 'vjezbe') as prosjek_v,
      (select count(*)::int from v_dolaznost where kolegij_id = ${kolegijId} and tip = 'predavanje' and postotak < prag) as ispod_p,
      (select count(*)::int from v_dolaznost where kolegij_id = ${kolegijId} and tip = 'vjezbe' and postotak < prag) as ispod_v
  `.execute(tx);

  const termini = (kada: "buduci" | "neevidentirani") =>
    tx
      .selectFrom("termin as t")
      .innerJoin("grupa as g", "g.id", "t.grupa_id")
      .select(["t.id", "t.pocetak", "t.tema", "g.naziv as grupa"])
      .where("t.kolegij_id", "=", kolegijId)
      .where("t.otkazan", "=", false)
      .$if(kada === "buduci", (q) => q.where("t.pocetak", ">=", sql<Date>`now()`).orderBy("t.pocetak", "asc"))
      .$if(kada === "neevidentirani", (q) =>
        q.where("t.pocetak", "<", sql<Date>`now()`).where("t.evidencija_spremljena_at", "is", null).orderBy("t.pocetak", "desc"),
      )
      .limit(6)
      .execute();

  return { ...rows[0], sljedeci: await termini("buduci"), neevidentirani: await termini("neevidentirani") };
}
