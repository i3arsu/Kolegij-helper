"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { sql } from "kysely";
import { z } from "zod";
import { jezikObrasca, prefiksJezika } from "@/i18n/obrazac";
import { upit } from "@/lib/auth/guard";
import { kreirajKolegij } from "@/lib/servisi/kolegij";
import { porukaGreske } from "@/lib/http/greske";

type Prijevod = Awaited<ReturnType<typeof getTranslations>>;

const shema = (t: Prijevod) =>
  z.object({
    naziv: z.string().trim().min(2, t("validation.nameRequired")).max(200, t("validation.nameTooLong")),
    sifra: z.string().trim().min(1, t("validation.codeRequired")).max(30, t("validation.codeTooLong")),
    akademska_godina: z.string().regex(/^\d{4}\/\d{4}$/, t("validation.academicYearFormat")),
    semestar: z.enum(["zimski", "ljetni"], t("validation.semesterInvalid")),
    nastavnik_email: z.string().trim().toLowerCase().optional(),
  });

export type StanjeKolegija = { greska?: string };

export async function kreirajKolegijAkcija(_: StanjeKolegija, forma: FormData): Promise<StanjeKolegija> {
  const locale = jezikObrasca(forma);
  const t = await getTranslations({ locale, namespace: "courseForm" });
  const p = shema(t).safeParse(Object.fromEntries(forma));
  if (!p.success) return { greska: p.error.issues[0].message };
  let id: string;
  try {
    id = await upit(async (tx, profil) => {
      if (!profil.jeAdmin) throw new Error(t("errors.adminOnly"));
      let nastavnik = profil.osoblje?.id ?? null;
      if (p.data.nastavnik_email) {
        const { rows } = await sql<{ id: string | null }>`select private.nadji_osoblje(${p.data.nastavnik_email}) as id`.execute(tx);
        if (!rows[0]?.id) throw new Error(t("errors.staffEmailNotFound"));
        nastavnik = rows[0].id;
      }
      if (!nastavnik) throw new Error(t("errors.teacherEmailRequired"));
      const { naziv, sifra, akademska_godina, semestar } = p.data;
      return kreirajKolegij(tx, { naziv, sifra, akademska_godina, semestar }, nastavnik);
    });
  } catch (e) {
    return { greska: porukaGreske(e, await getTranslations({ locale, namespace: "errors" })) };
  }
  revalidatePath("/nastava");
  redirect(`${prefiksJezika(locale)}/nastava/${id}`);
}
