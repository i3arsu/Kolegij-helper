"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { upit, zahtijevajNastavnika } from "@/lib/auth/guard";
import { porukaGreske } from "@/lib/http/greske";
import { dodajOsoblje, spremiPravila, ukloniOsoblje } from "@/lib/servisi/kolegij";

export type Stanje = { greska?: string; ok?: string };

const postotak = z.coerce.number().min(0, "Postotak mora biti između 0 i 100").max(100, "Postotak mora biti između 0 i 100");

export async function pravilaAkcija(kolegijId: string, _: Stanje, forma: FormData): Promise<Stanje> {
  await zahtijevajNastavnika(kolegijId);
  const p = z
    .object({
      min_dolaznost_predavanja: postotak,
      min_dolaznost_vjezbi: postotak,
      min_bodova: z.coerce.number().min(0),
      opravdano_se_racuna: z.enum(["kao_prisutan", "izuzeto", "kao_odsutan"]),
    })
    .safeParse(Object.fromEntries(forma));
  if (!p.success) return { greska: p.error.issues[0].message };
  try {
    await upit((tx) => spremiPravila(tx, kolegijId, p.data));
  } catch (e) {
    return { greska: porukaGreske(e) };
  }
  revalidatePath(`/nastava/${kolegijId}`, "layout");
  return { ok: "Pravila su spremljena." };
}

export async function osobljeAkcija(kolegijId: string, _: Stanje, forma: FormData): Promise<Stanje> {
  await zahtijevajNastavnika(kolegijId);
  const p = z
    .object({ email: z.string().trim().toLowerCase().pipe(z.email("Neispravan e-mail")), uloga: z.enum(["nastavnik", "asistent"]) })
    .safeParse(Object.fromEntries(forma));
  if (!p.success) return { greska: p.error.issues[0].message };
  try {
    await upit((tx) => dodajOsoblje(tx, kolegijId, p.data.email, p.data.uloga));
  } catch (e) {
    return { greska: porukaGreske(e) };
  }
  revalidatePath(`/nastava/${kolegijId}/postavke`);
  return { ok: "Dodano." };
}

export async function ukloniOsobljeAkcija(kolegijId: string, osobljeId: string) {
  await zahtijevajNastavnika(kolegijId);
  await upit((tx, profil) => ukloniOsoblje(tx, kolegijId, z.uuid().parse(osobljeId), profil.osoblje?.id ?? ""));
  revalidatePath(`/nastava/${kolegijId}`, "layout");
}
