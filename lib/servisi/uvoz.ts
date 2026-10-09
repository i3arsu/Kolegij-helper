import { sql } from "kysely";
import type { Tx } from "@/lib/db/klijent";
import { generirajLozinku } from "@/lib/auth/generator-lozinke";
import { hashLozinke } from "@/lib/auth/lozinka";
import { usporedi, type PostojeciEmail, type PostojeciStudent, type PregledUvoza } from "@/lib/csv/usporedi";
import type { RedUvoza } from "@/lib/csv/validiraj";

async function pripremi(tx: Tx, kolegijId: string, redovi: RedUvoza[]) {
  const { rows } = await sql<{ r: { studenti: PostojeciStudent[]; emailovi: PostojeciEmail[] } }>`
    select private.uvoz_pripremi(${kolegijId}, ${redovi.map((r) => r.jmbag)}::text[], ${redovi.map((r) => r.email)}::text[]) as r
  `.execute(tx);
  return rows[0].r;
}

export async function grupeKolegija(tx: Tx, kolegijId: string) {
  return tx
    .selectFrom("grupa")
    .select(["id", "naziv", "tip"])
    .where("kolegij_id", "=", kolegijId)
    .orderBy("tip")
    .orderBy("naziv")
    .execute() as Promise<{ id: string; naziv: string; tip: "predavanje" | "vjezbe" }[]>;
}

export async function pregledUvoza(tx: Tx, kolegijId: string, redovi: RedUvoza[]): Promise<PregledUvoza> {
  const { studenti, emailovi } = await pripremi(tx, kolegijId, redovi);
  const upisani = await tx
    .selectFrom("upis as u")
    .innerJoin("student as s", "s.id", "u.student_id")
    .select(["s.jmbag", "s.ime", "s.prezime"])
    .where("u.kolegij_id", "=", kolegijId)
    .where("u.status", "=", "aktivan")
    .execute();
  return usporedi(redovi, studenti, emailovi, upisani);
}

export type PristupniPodaci = { jmbag: string; ime: string; prezime: string; email: string; lozinka: string };

export type RezultatUvoza = {
  novi: number;
  upisani_postojeci: number;
  izmijenjeni: number;
  promjene_grupe: number;
  ponovno_upisani: number;
  nepromijenjeni: number;
  pristupniPodaci: PristupniPodaci[];
};

/**
 * Izvršava uvoz u transakciji pozivatelja. Lozinke se generiraju samo za JMBAG-ove bez računa;
 * plaintext se vraća jednom (za prikaz/preuzimanje) i nigdje se ne sprema.
 */
export async function izvrsiUvoz(
  tx: Tx,
  kolegijId: string,
  redovi: RedUvoza[],
  datumPromjene: Date,
  nazivDatoteke: string | null,
): Promise<RezultatUvoza> {
  const { studenti } = await pripremi(tx, kolegijId, redovi);
  const postojeci = new Set(studenti.map((s) => s.jmbag));

  const pristupniPodaci: PristupniPodaci[] = [];
  const zaBazu = await Promise.all(
    redovi.map(async (r) => {
      let lozinka_hash: string | null = null;
      if (!postojeci.has(r.jmbag)) {
        const lozinka = generirajLozinku();
        pristupniPodaci.push({ jmbag: r.jmbag, ime: r.ime, prezime: r.prezime, email: r.email, lozinka });
        lozinka_hash = await hashLozinke(lozinka);
      }
      return { jmbag: r.jmbag, ime: r.ime, prezime: r.prezime, email: r.email, grupa_p: r.grupa_p, grupa_v: r.grupa_v, lozinka_hash };
    }),
  );

  const { rows } = await sql<{ r: Omit<RezultatUvoza, "pristupniPodaci"> }>`
    select private.uvezi_studente(${kolegijId}, ${JSON.stringify(zaBazu)}::jsonb, ${datumPromjene}, ${nazivDatoteke}) as r
  `.execute(tx);
  pristupniPodaci.sort((a, b) => a.prezime.localeCompare(b.prezime, "hr") || a.ime.localeCompare(b.ime, "hr"));
  return { ...rows[0].r, pristupniPodaci };
}
