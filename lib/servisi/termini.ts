import { sql } from "kysely";
import type { Tx } from "@/lib/db/klijent";
import { GreskaAplikacije } from "@/lib/http/greske";

export type StatusDolaska = "prisutan" | "odsutan" | "opravdano";

export async function terminiKolegija(tx: Tx, kolegijId: string) {
  return tx
    .selectFrom("termin as t")
    .innerJoin("grupa as g", "g.id", "t.grupa_id")
    .select(["t.id", "t.pocetak", "t.kraj", "t.tema", "t.otkazan", "t.evidencija_spremljena_at", "g.naziv as grupa", "g.tip"])
    .select(sql<boolean>`t.pocetak < now()`.as("prosao"))
    .where("t.kolegij_id", "=", kolegijId)
    .orderBy("t.pocetak")
    .orderBy("g.naziv")
    .execute();
}

export async function kreirajTermine(
  tx: Tx,
  kolegijId: string,
  grupaId: string,
  termini: { pocetak: Date; kraj: Date }[],
  tema: string | null,
) {
  if (termini.length === 0) return 0;
  await tx
    .insertInto("termin")
    .values(termini.map((t) => ({ kolegij_id: kolegijId, grupa_id: grupaId, pocetak: t.pocetak, kraj: t.kraj, tema })))
    .execute();
  return termini.length;
}

export async function postaviOtkazan(tx: Tx, terminId: string, otkazan: boolean) {
  const r = await tx.updateTable("termin").set({ otkazan }).where("id", "=", terminId).executeTakeFirst();
  if (Number(r.numUpdatedRows) === 0) throw new GreskaAplikacije("sessionNotFound");
}

export async function obrisiTermin(tx: Tx, terminId: string) {
  const ima = await tx.selectFrom("dolazak").select("termin_id").where("termin_id", "=", terminId).executeTakeFirst();
  if (ima) throw new GreskaAplikacije("sessionHasAttendance");
  const r = await tx.deleteFrom("termin").where("id", "=", terminId).executeTakeFirst();
  if (Number(r.numDeletedRows) === 0) throw new GreskaAplikacije("sessionNotFound");
}

/** Termin s popisom studenata koji su bili članovi grupe u vrijeme termina, plus gosti. */
export async function evidencijaTermina(tx: Tx, terminId: string) {
  const termin = await tx
    .selectFrom("termin as t")
    .innerJoin("grupa as g", "g.id", "t.grupa_id")
    .select([
      "t.id", "t.kolegij_id", "t.grupa_id", "t.pocetak", "t.kraj", "t.tema", "t.otkazan",
      "t.evidencija_spremljena_at", "g.naziv as grupa", "g.tip",
    ])
    .select(sql<boolean>`t.pocetak > now()`.as("buduci"))
    .where("t.id", "=", terminId)
    .executeTakeFirst();
  if (!termin) return null;

  const { rows: studenti } = await sql<{
    student_id: string; jmbag: string; ime: string; prezime: string;
    status: StatusDolaska | null; napomena: string | null; gost: boolean; nacin: string | null;
  }>`
    select * from (
    select s.id as student_id, s.jmbag, s.ime, s.prezime, d.status, d.napomena, coalesce(d.gost, false) as gost, d.nacin
    from clanstvo_grupe cg
    join upis u on u.id = cg.upis_id
    join student s on s.id = u.student_id
    left join dolazak d on d.termin_id = ${terminId} and d.student_id = s.id
    where cg.grupa_id = ${termin.grupa_id} and cg.vrijedi @> ${termin.pocetak}::timestamptz and u.status = 'aktivan'
    union all
    select s.id, s.jmbag, s.ime, s.prezime, d.status, d.napomena, true, d.nacin
    from dolazak d join student s on s.id = d.student_id
    where d.termin_id = ${terminId} and d.gost
    ) x
    order by gost, prezime collate "hr-HR-x-icu", ime collate "hr-HR-x-icu"
  `.execute(tx);
  return { termin, studenti };
}

/** Sprema evidenciju za sve članove grupe odjednom i označava termin evidentiranim. */
export async function spremiEvidenciju(
  tx: Tx,
  terminId: string,
  stavke: { studentId: string; status: StatusDolaska; napomena: string | null; gost?: boolean }[],
) {
  for (const s of stavke) {
    await tx
      .insertInto("dolazak")
      .values({ termin_id: terminId, student_id: s.studentId, status: s.status, napomena: s.napomena, gost: s.gost ?? false })
      .onConflict((oc) =>
        oc.columns(["termin_id", "student_id"]).doUpdateSet((eb) => ({
          status: eb.ref("excluded.status"),
          napomena: eb.ref("excluded.napomena"),
          nacin: "rucno",
        })),
      )
      .execute();
  }
  const r = await tx
    .updateTable("termin")
    .set({ evidencija_spremljena_at: sql`coalesce(evidencija_spremljena_at, now())` })
    .where("id", "=", terminId)
    .executeTakeFirst();
  if (Number(r.numUpdatedRows) === 0) throw new GreskaAplikacije("sessionNotFound");
}

export async function dodajGosta(tx: Tx, terminId: string, jmbag: string) {
  const { rows } = await sql<{ id: string | null }>`select private.nadji_studenta_za_termin(${terminId}, ${jmbag}) as id`.execute(tx);
  const studentId = rows[0]?.id;
  if (!studentId) throw new GreskaAplikacije("guestNotEnrolled");
  await tx
    .insertInto("dolazak")
    .values({ termin_id: terminId, student_id: studentId, status: "prisutan", gost: true, napomena: "Gost" })
    .onConflict((oc) => oc.columns(["termin_id", "student_id"]).doNothing())
    .execute();
}

/** Dolaznost jednog studenta po terminima (za profil i studentski prikaz). */
export async function dolasciStudenta(tx: Tx, kolegijId: string, studentId: string) {
  const { rows } = await sql<{
    termin_id: string; pocetak: Date; kraj: Date; tema: string | null; grupa: string; tip: string;
    otkazan: boolean; evidentirano: boolean; prosao: boolean; status: StatusDolaska | null; gost: boolean; napomena: string | null;
  }>`
    select t.id as termin_id, t.pocetak, t.kraj, t.tema, g.naziv as grupa, g.tip::text as tip, t.otkazan,
           t.evidencija_spremljena_at is not null as evidentirano, t.pocetak <= now() as prosao,
           case when d.status is not null then d.status::text
                when t.evidencija_spremljena_at is not null and not t.otkazan then 'odsutan' end as status,
           coalesce(d.gost, false) as gost, d.napomena
    from termin t
    join grupa g on g.id = t.grupa_id
    left join dolazak d on d.termin_id = t.id and d.student_id = ${studentId}
    where t.kolegij_id = ${kolegijId}
      and (d.student_id is not null
           or exists (select 1 from clanstvo_grupe cg join upis u on u.id = cg.upis_id
                      where u.student_id = ${studentId} and cg.grupa_id = t.grupa_id and cg.vrijedi @> t.pocetak))
    order by t.pocetak
  `.execute(tx);
  return rows;
}

/** Grupe za koje pozivatelj smije kreirati termine (nastavnik: sve, asistent: svoje). */
export async function grupeZaTermine(tx: Tx, kolegijId: string) {
  const { rows } = await sql<{ id: string; naziv: string }>`
    select g.id, g.naziv from grupa g
    where g.kolegij_id = ${kolegijId} and private.vidi_grupu(g.id)
    order by g.tip, g.naziv
  `.execute(tx);
  return rows;
}
