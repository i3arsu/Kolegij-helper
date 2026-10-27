
import { sql } from "kysely";

import type { Tx } from "@/lib/db/klijent";
import type {
  StatusPredaje,
  TipGrupe,
} from "@/lib/db/tipovi";

export type GrupaPredaje = {
  id: string;
  naziv: string;
  tip: TipGrupe;
};

export type RedPredajeZadatka = {
  student_id: string;
  jmbag: string;
  ime: string;
  prezime: string;
  predaja_id: string | null;
  status: StatusPredaje;
  trenutna_verzija: number;
  bodovi: string | null;
  predano_at: Date | null;
  kasni: boolean;
  rok: Date;
  rok_prosao: boolean;
  ima_produljenje: boolean;
  grupe: GrupaPredaje[];
};

/**
 * Vraća studente kojima je objavljeni zadatak dodijeljen,
 * njihov status predaje, efektivni rok, informaciju o produljenju
 * i trenutne grupe.
 *
 * Pristup redovima ograničavaju RLS pravila i security_invoker
 * na pogledu v_predaja. Ne zaobilaziti ih dodatnim privilegijama.
 */
export async function predajeZadatka(
  tx: Tx,
  kolegijId: string,
  zadatakId: string,
): Promise<RedPredajeZadatka[]> {
  const { rows } = await sql<RedPredajeZadatka>`
    select
      vp.student_id,
      s.jmbag,
      s.ime,
      s.prezime,
      vp.predaja_id,
      vp.status::text as status,
      vp.trenutna_verzija,
      vp.bodovi::text as bodovi,
      vp.predano_at,
      coalesce(vp.kasni, false) as kasni,
      vp.rok,
      coalesce(vp.rok_prosao, false) as rok_prosao,
      (vp.rok <> z.rok) as ima_produljenje,
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
          from public.clanstvo_grupe cg
          join public.upis u
            on u.id = cg.upis_id
          join public.grupa g
            on g.id = cg.grupa_id
          where u.student_id = vp.student_id
            and u.kolegij_id = vp.kolegij_id
            and upper_inf(cg.vrijedi)
        ),
        '[]'::jsonb
      ) as grupe
    from public.v_predaja vp
    join public.zadatak z
      on z.id = vp.zadatak_id
    join public.student s
      on s.id = vp.student_id
    where vp.kolegij_id = ${kolegijId}
      and vp.zadatak_id = ${zadatakId}
    order by
      s.prezime collate "hr-HR-x-icu",
      s.ime collate "hr-HR-x-icu",
      s.jmbag
  `.execute(tx);

  return rows;
}