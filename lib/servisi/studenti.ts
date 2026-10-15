import { sql } from "kysely";
import type { Tx } from "@/lib/db/klijent";
import { generirajLozinku } from "@/lib/auth/generator-lozinke";
import { hashLozinke } from "@/lib/auth/lozinka";
import { GreskaAplikacije } from "@/lib/http/greske";

export type RedStudenta = {
  student_id: string;
  upis_id: string;
  jmbag: string;
  ime: string;
  prezime: string;
  email: string;
  status: string;
  grupa_p: string | null;
  grupa_v: string | null;
  dolaznost_p: number | null;
  dolaznost_v: number | null;
  prag_p: number | null;
  prag_v: number | null;
  zadnja_prijava: Date | null;
};

/** Studenti kolegija koje pozivatelj smije vidjeti (RLS: nastavnik sve, asistent svoje grupe). */
export async function studentiKolegija(tx: Tx, kolegijId: string, ukljuciIspisane = false): Promise<RedStudenta[]> {
  const { rows } = await sql<RedStudenta>`
    select s.id as student_id, u.id as upis_id, s.jmbag, s.ime, s.prezime, k.email::text as email, u.status,
           (select g.naziv from clanstvo_grupe cg join grupa g on g.id = cg.grupa_id
             where cg.upis_id = u.id and cg.tip = 'predavanje' and upper_inf(cg.vrijedi)) as grupa_p,
           (select g.naziv from clanstvo_grupe cg join grupa g on g.id = cg.grupa_id
             where cg.upis_id = u.id and cg.tip = 'vjezbe' and upper_inf(cg.vrijedi)) as grupa_v,
           dp.postotak::float8 as dolaznost_p, dv.postotak::float8 as dolaznost_v,
           pp.min_dolaznost_predavanja::float8 as prag_p, pp.min_dolaznost_vjezbi::float8 as prag_v,
           k.zadnja_prijava
    from upis u
    join student s on s.id = u.student_id
    join korisnik k on k.id = s.korisnik_id
    left join pravila_prolaza pp on pp.kolegij_id = u.kolegij_id
    left join v_dolaznost dp on dp.kolegij_id = u.kolegij_id and dp.student_id = s.id and dp.tip = 'predavanje'
    left join v_dolaznost dv on dv.kolegij_id = u.kolegij_id and dv.student_id = s.id and dv.tip = 'vjezbe'
    where u.kolegij_id = ${kolegijId}
      and (${ukljuciIspisane} or u.status = 'aktivan')
    order by s.prezime collate "hr-HR-x-icu", s.ime collate "hr-HR-x-icu", s.jmbag
  `.execute(tx);
  return rows;
}

export async function resetirajLozinku(tx: Tx, studentId: string): Promise<string> {
  const lozinka = generirajLozinku();
  await sql`select private.resetiraj_lozinku(${studentId}, ${await hashLozinke(lozinka)})`.execute(tx);
  return lozinka;
}

export async function promijeniGrupu(tx: Tx, upisId: string, grupaId: string, od: Date) {
  await sql`select private.promijeni_grupu(${upisId}, ${grupaId}, ${od})`.execute(tx);
}

export async function postaviStatusUpisa(tx: Tx, upisId: string, status: "aktivan" | "ispisan") {
  const r = await tx.updateTable("upis").set({ status }).where("id", "=", upisId).executeTakeFirst();
  if (Number(r.numUpdatedRows) === 0) throw new GreskaAplikacije("enrollmentNotFound");
}
