"use server";

import { revalidatePath } from "next/cache";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { routing } from "@/i18n/routing";
import { upit, zahtijevajNastavnika } from "@/lib/auth/guard";
import { lokalnoUTrenutak } from "@/lib/domena/vrijeme";
import { porukaGreske } from "@/lib/http/greske";
import {
  postaviStatusUpisa,
  promijeniGrupu,
  resetirajLozinku,
} from "@/lib/servisi/studenti";

const uuid = z.uuid();

function jezikObrasca(forma: FormData) {
  const trazeniLocale = forma.get("locale");

  return hasLocale(routing.locales, trazeniLocale)
    ? trazeniLocale
    : routing.defaultLocale;
}

export type StanjeReseta = {
  lozinka?: string;
  greska?: string;
};

export async function resetLozinkeAkcija(
  kolegijId: string,
  studentId: string,
  _prethodnoStanje: StanjeReseta,
  forma: FormData,
): Promise<StanjeReseta> {
  await zahtijevajNastavnika(kolegijId);

  try {
    const lozinka = await upit((tx) =>
      resetirajLozinku(tx, uuid.parse(studentId)),
    );

    return { lozinka };
  } catch (e) {
    return {
      greska: porukaGreske(
        e,
        await getTranslations({ locale: jezikObrasca(forma), namespace: "errors" }),
      ),
    };
  }
}

export type StanjeGrupe = {
  greska?: string;
  ok?: boolean;
};

export async function promjenaGrupeAkcija(
  kolegijId: string,
  upisId: string,
  _prethodnoStanje: StanjeGrupe,
  forma: FormData,
): Promise<StanjeGrupe> {
  const locale = jezikObrasca(forma);

  const t = await getTranslations({
    locale,
    namespace: "teacherStudentActions",
  });

  await zahtijevajNastavnika(kolegijId);

  const p = z
    .object({
      grupa_id: z.uuid(t("validation.selectGroup")),
      datum: z.iso.date(t("validation.selectDate")),
    })
    .safeParse(Object.fromEntries(forma));

  if (!p.success) {
    return { greska: p.error.issues[0].message };
  }

  try {
    await upit((tx) =>
      promijeniGrupu(
        tx,
        uuid.parse(upisId),
        p.data.grupa_id,
        lokalnoUTrenutak(p.data.datum, "00:00"),
      ),
    );
  } catch (e) {
    return {
      greska: porukaGreske(e, await getTranslations({ locale, namespace: "errors" })),
    };
  }

  const prefiks = locale === routing.defaultLocale ? "" : `/${locale}`;

  revalidatePath(
    `${prefiks}/nastava/${kolegijId}/studenti`,
    "layout",
  );

  return { ok: true };
}

export async function statusUpisaAkcija(
  kolegijId: string,
  upisId: string,
  status: "aktivan" | "ispisan",
  locale: string,
) {
  await zahtijevajNastavnika(kolegijId);

  await upit((tx) =>
    postaviStatusUpisa(tx, uuid.parse(upisId), status),
  );

  const prefiks = locale === "en" ? "/en" : "";

  revalidatePath(
    `${prefiks}/nastava/${kolegijId}`,
    "layout",
  );
}