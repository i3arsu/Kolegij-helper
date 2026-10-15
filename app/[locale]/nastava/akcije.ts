"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "kysely";
import { z } from "zod";
import { upit } from "@/lib/auth/guard";
import { kreirajKolegij } from "@/lib/servisi/kolegij";
import { porukaGreske } from "@/lib/http/greske";

const shema = z.object({
  naziv: z.string().trim().min(2, "Naziv je obavezan").max(200),
  sifra: z.string().trim().min(1, "Šifra je obavezna").max(30),
  akademska_godina: z.string().regex(/^\d{4}\/\d{4}$/, "Format akademske godine: 2026/2027"),
  semestar: z.enum(["zimski", "ljetni"]),
  nastavnik_email: z.string().trim().toLowerCase().optional(),
});

export type StanjeKolegija = { greska?: string };

export async function kreirajKolegijAkcija(_: StanjeKolegija, forma: FormData): Promise<StanjeKolegija> {
  const p = shema.safeParse(Object.fromEntries(forma));
  if (!p.success) return { greska: p.error.issues[0].message };
  let id: string;
  try {
    id = await upit(async (tx, profil) => {
      if (!profil.jeAdmin) throw new Error("Samo administrator može kreirati kolegij.");
      let nastavnik = profil.osoblje?.id ?? null;
      if (p.data.nastavnik_email) {
        const { rows } = await sql<{ id: string | null }>`select private.nadji_osoblje(${p.data.nastavnik_email}) as id`.execute(tx);
        if (!rows[0]?.id) throw new Error("Ne postoji član osoblja s tom e-mail adresom.");
        nastavnik = rows[0].id;
      }
      if (!nastavnik) throw new Error("Navedite e-mail nastavnika kolegija.");
      const { naziv, sifra, akademska_godina, semestar } = p.data;
      return kreirajKolegij(tx, { naziv, sifra, akademska_godina, semestar }, nastavnik);
    });
  } catch (e) {
    return { greska: porukaGreske(e) };
  }
  revalidatePath("/nastava");
  redirect(`/nastava/${id}`);
}
