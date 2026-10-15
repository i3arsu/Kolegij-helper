"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { jezikObrasca } from "@/i18n/obrazac";
import { upit, zahtijevajNastavnika } from "@/lib/auth/guard";
import { porukaGreske } from "@/lib/http/greske";
import { dodajOsoblje, spremiPravila, ukloniOsoblje } from "@/lib/servisi/kolegij";

export type Stanje = { greska?: string; ok?: string };

const postotak = (poruka: string) => z.coerce.number().min(0, poruka).max(100, poruka);

export async function pravilaAkcija(kolegijId: string, _: Stanje, forma: FormData): Promise<Stanje> {
  await zahtijevajNastavnika(kolegijId);
  const locale = jezikObrasca(forma);
  const t = await getTranslations({ locale, namespace: "teacherSettings" });
  const p = z
    .object({
      min_dolaznost_predavanja: postotak(t("validation.percentRange")),
      min_dolaznost_vjezbi: postotak(t("validation.percentRange")),
      min_bodova: z.coerce.number().min(0),
      opravdano_se_racuna: z.enum(["kao_prisutan", "izuzeto", "kao_odsutan"]),
    })
    .safeParse(Object.fromEntries(forma));
  if (!p.success) return { greska: p.error.issues[0].message };
  try {
    await upit((tx) => spremiPravila(tx, kolegijId, p.data));
  } catch (e) {
    return { greska: porukaGreske(e, await getTranslations({ locale, namespace: "errors" })) };
  }
  revalidatePath(`/nastava/${kolegijId}`, "layout");
  return { ok: t("rulesSaved") };
}

export async function osobljeAkcija(kolegijId: string, _: Stanje, forma: FormData): Promise<Stanje> {
  await zahtijevajNastavnika(kolegijId);
  const locale = jezikObrasca(forma);
  const t = await getTranslations({ locale, namespace: "teacherSettings" });
  const p = z
    .object({ email: z.string().trim().toLowerCase().pipe(z.email(t("validation.invalidEmail"))), uloga: z.enum(["nastavnik", "asistent"]) })
    .safeParse(Object.fromEntries(forma));
  if (!p.success) return { greska: p.error.issues[0].message };
  try {
    await upit((tx) => dodajOsoblje(tx, kolegijId, p.data.email, p.data.uloga));
  } catch (e) {
    return { greska: porukaGreske(e, await getTranslations({ locale, namespace: "errors" })) };
  }
  revalidatePath(`/nastava/${kolegijId}/postavke`);
  return { ok: t("added") };
}

export async function ukloniOsobljeAkcija(kolegijId: string, osobljeId: string) {
  await zahtijevajNastavnika(kolegijId);
  await upit((tx, profil) => ukloniOsoblje(tx, kolegijId, z.uuid().parse(osobljeId), profil.osoblje?.id ?? ""));
  revalidatePath(`/nastava/${kolegijId}`, "layout");
}
