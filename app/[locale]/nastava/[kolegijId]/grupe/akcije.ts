"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { jezikObrasca } from "@/i18n/obrazac";
import { upit, zahtijevajNastavnika } from "@/lib/auth/guard";
import { porukaGreske } from "@/lib/http/greske";
import { kreirajGrupu, postaviAsistenta } from "@/lib/servisi/kolegij";

export type Stanje = { greska?: string };

export async function novaGrupaAkcija(kolegijId: string, _: Stanje, forma: FormData): Promise<Stanje> {
  await zahtijevajNastavnika(kolegijId);
  const locale = jezikObrasca(forma);
  const t = await getTranslations({ locale, namespace: "teacherGroups" });
  const p = z
    .object({ naziv: z.string().trim().min(1, t("validation.nameRequired")).max(50), tip: z.enum(["predavanje", "vjezbe"]) })
    .safeParse(Object.fromEntries(forma));
  if (!p.success) return { greska: p.error.issues[0].message };
  try {
    await upit((tx) => kreirajGrupu(tx, kolegijId, p.data.naziv, p.data.tip));
  } catch (e) {
    return { greska: porukaGreske(e, await getTranslations({ locale, namespace: "errors" })) };
  }
  revalidatePath(`/nastava/${kolegijId}/grupe`);
  return {};
}

export async function asistentAkcija(kolegijId: string, grupaId: string, osobljeId: string, dodijeljen: boolean) {
  await zahtijevajNastavnika(kolegijId);
  await upit((tx) => postaviAsistenta(tx, z.uuid().parse(grupaId), z.uuid().parse(osobljeId), dodijeljen));
  revalidatePath(`/nastava/${kolegijId}/grupe`);
}
