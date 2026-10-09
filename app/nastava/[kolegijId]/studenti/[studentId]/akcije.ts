"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { upit, zahtijevajNastavnika } from "@/lib/auth/guard";
import { lokalnoUTrenutak } from "@/lib/domena/vrijeme";
import { porukaGreske } from "@/lib/http/greske";
import { postaviStatusUpisa, promijeniGrupu, resetirajLozinku } from "@/lib/servisi/studenti";

const uuid = z.uuid();

export type StanjeReseta = { lozinka?: string; greska?: string };

export async function resetLozinkeAkcija(kolegijId: string, studentId: string): Promise<StanjeReseta> {
  await zahtijevajNastavnika(kolegijId);
  try {
    const lozinka = await upit((tx) => resetirajLozinku(tx, uuid.parse(studentId)));
    return { lozinka };
  } catch (e) {
    return { greska: porukaGreske(e) };
  }
}

export type StanjeGrupe = { greska?: string; ok?: boolean };

export async function promjenaGrupeAkcija(kolegijId: string, upisId: string, _: StanjeGrupe, forma: FormData): Promise<StanjeGrupe> {
  await zahtijevajNastavnika(kolegijId);
  const p = z
    .object({ grupa_id: z.uuid("Odaberite grupu"), datum: z.iso.date("Odaberite datum promjene") })
    .safeParse(Object.fromEntries(forma));
  if (!p.success) return { greska: p.error.issues[0].message };
  try {
    await upit((tx) => promijeniGrupu(tx, uuid.parse(upisId), p.data.grupa_id, lokalnoUTrenutak(p.data.datum, "00:00")));
  } catch (e) {
    return { greska: porukaGreske(e) };
  }
  revalidatePath(`/nastava/${kolegijId}/studenti`, "layout");
  return { ok: true };
}

export async function statusUpisaAkcija(kolegijId: string, upisId: string, status: "aktivan" | "ispisan") {
  await zahtijevajNastavnika(kolegijId);
  await upit((tx) => postaviStatusUpisa(tx, uuid.parse(upisId), status));
  revalidatePath(`/nastava/${kolegijId}`, "layout");
}
