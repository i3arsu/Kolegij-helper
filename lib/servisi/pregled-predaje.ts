
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
 */
export async function pregledPredaje(
  tx: Tx,
  kolegijId: string,
  zadatakId: string,
  predajaId: string,
): Promise<DetaljPregledaPredaje | null> {
  // 1. Osnovni podaci o predaji, studentu i zadatku.
  const osnovniRezultat = await sql<DetaljPregledaPredaje>`
    select
      vp.predaja_id,
      vp.student_id,
      s.jmbag,
      s.ime,
      s.prezime,
      z.id as zadatak_id,
      z.naslov,
      z.opis,
      z.rok as izvorni_rok,
      vp.rok,
      coalesce(vp.rok_prosao, false) as rok_prosao,
      coalesce(vp.kasni, false) as kasni,
      coalesce(vp.status::text, 'nije_predano') as status,
      coalesce(vp.trenutna_verzija, 0) as trenutna_verzija,
      vp.bodovi::text as bodovi,
      vp.pregledava,
      z.max_bodova::text as max_bodova,
      z.nacini_predaje,
      z.dopusti_kasnu_predaju,
      coalesce(vp.rok <> z.rok, false) as ima_produljenje,
      vp.predano_at
    from public.v_predaja vp
    join public.zadatak z
      on z.id = vp.zadatak_id
    join public.student s
      on s.id = vp.student_id
    where vp.kolegij_id = ${kolegijId}::uuid
      and vp.zadatak_id = ${zadatakId}::uuid
      and vp.predaja_id = ${predajaId}::uuid
      and z.objavljen_at is not null
    limit 1
  `.execute(tx);

  const osnovniPodaci = osnovniRezultat.rows[0];

  if (!osnovniPodaci) {
    return null;
  }

  // 2. Sve verzije i povratne informacije nastavnika.
  const verzijeRezultat = await sql<
    Omit<VerzijaPredajeZaPregled, "datoteke">
  >`
    select
      vv.verzija_id,
      vv.broj,
      vv.tekst,
      vv.link,
      vv.predano_at,
      vv.rok_verzije,
      coalesce(vv.kasni, false) as kasni,
      coalesce(now() > vv.rok_verzije, false)
        as rok_verzije_prosao,
      pi.odluka,
      pi.komentar,
      pi.bodovi::text as bodovi,
      pi.rok_dorade,
      coalesce(now() > pi.rok_dorade, false)
        as rok_dorade_prosao,
      pi.created_at as povratna_at,
      pi.autor_id
    from public.v_predaja_verzija vv
    left join public.povratna_informacija pi
      on pi.predaja_id = vv.predaja_id
     and pi.verzija_broj = vv.broj
    where vv.predaja_id = ${predajaId}::uuid
    order by vv.broj desc
  `.execute(tx);

  // 3. Datoteke povezane sa svakom verzijom.
  const datotekeRezultat = await sql<{
    broj: number;
    id: string;
    naziv: string;
    velicina: string;
    mime: string;
    created_at: Date;
  }>`
    select
      pv.broj,
      d.id,
      d.naziv,
      d.velicina::text as velicina,
      d.mime,
      d.created_at
    from public.predaja_datoteka pd
    join public.predaja_verzija pv
      on pv.id = pd.verzija_id
    join public.datoteka d
      on d.id = pd.datoteka_id
    where pv.predaja_id = ${predajaId}::uuid
    order by
      pv.broj desc,
      d.created_at asc,
      d.naziv asc
  `.execute(tx);

  // Grupiramo datoteke prema broju verzije.
  const datotekePoVerziji = new Map<
    number,
    DatotekaVerzijePredaje[]
  >();

  for (const datoteka of datotekeRezultat.rows) {
    const { broj, ...detalji } = datoteka;
    const trenutne = datotekePoVerziji.get(broj) ?? [];

    trenutne.push(detalji);
    datotekePoVerziji.set(broj, trenutne);
  }

  // Povezujemo datoteke sa odgovarajućim verzijama.
  const verzije = verzijeRezultat.rows.map((verzija) => ({
    ...verzija,
    datoteke: datotekePoVerziji.get(verzija.broj) ?? [],
  }));

  return {
    ...osnovniPodaci,
    verzije,
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
  const rezultat = await sql<{
    predaja_id: string;
  }>`
    select vp.predaja_id
    from public.v_predaja vp
    where vp.kolegij_id = ${kolegijId}::uuid
      and vp.zadatak_id = ${zadatakId}::uuid
      and vp.predaja_id is not null
      and vp.predaja_id <> ${trenutnaPredajaId}::uuid
      and vp.status::text = 'predano'
    order by
      vp.predano_at asc nulls last,
      vp.predaja_id asc
    limit 1
  `.execute(tx);

  return rezultat.rows[0]?.predaja_id ?? null;
}