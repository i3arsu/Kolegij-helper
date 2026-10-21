
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  jezikObrasca,
  prefiksJezika,
} from "@/i18n/obrazac";
import {
  upit,
  zahtijevajNastavnika,
} from "@/lib/auth/guard";
import { porukaGreske } from "@/lib/http/greske";
import {
  formatVrijeme,
  isoDatum,
  lokalnoUTrenutak,
} from "@/lib/domena/vrijeme";
import {
  kreirajZadatak,
  objaviZadatak,
  urediZadatak,
  type PodaciZadatka,
} from "@/lib/servisi/zadaci";

type Prijevod = Awaited<ReturnType<typeof getTranslations>>;

export type Stanje = {
  greska?: string;
  ok?: string;
};

function datumValjan(datum: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    return false;
  }

  const d = new Date(`${datum}T00:00:00.000Z`);

  return (
    Number.isFinite(d.getTime()) &&
    d.toISOString().slice(0, 10) === datum
  );
}

type RezultatCitanja =
  | { greska: string }
  | { podaci: PodaciZadatka };

/** Zajednička validacija podataka za kreiranje i uređivanje zadatka. */
function procitajZadatak(
  forma: FormData,
  t: Prijevod,
): RezultatCitanja {
  const rezultat = z
    .object({
      naslov: z
        .string()
        .trim()
        .min(1, t("validation.titleRequired"))
        .max(200, t("validation.titleMax")),

      opis: z
        .string()
        .max(20000, t("validation.descriptionMax")),

      datum: z
        .string()
        .refine(datumValjan, t("validation.invalidDate")),

      vrijeme: z
        .string()
        .regex(
          /^(?:[01]\d|2[0-3]):[0-5]\d$/,
          t("validation.invalidTime"),
        ),

      max_bodova: z
        .coerce
        .number()
        .finite()
        .gt(0, t("validation.maxPointsPositive"))
        .max(9999.99, t("validation.maxPointsMax"))
        .refine(
          (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-7,
          t("validation.maxPointsPrecision"),
        ),

      nacini_predaje: z
        .array(z.enum(["datoteka", "link", "tekst"]))
        .min(1, t("validation.methodRequired")),

      dopusti_kasnu_predaju: z.boolean(),

      cilj: z.enum(["cijeli_kolegij", "grupe"]),

      grupaIds: z.array(z.uuid()),
    })
    .superRefine((p, ctx) => {
      if (p.cilj === "grupe" && p.grupaIds.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["grupaIds"],
          message: t("validation.groupsRequired"),
        });
      }
    })
    .safeParse({
      naslov: forma.get("naslov"),
      opis: forma.get("opis"),
      datum: forma.get("datum"),
      vrijeme: forma.get("vrijeme"),
      max_bodova: forma.get("max_bodova"),
      nacini_predaje: forma.getAll("nacini_predaje"),
      dopusti_kasnu_predaju:
        forma.get("dopusti_kasnu_predaju") === "on",
      cilj: forma.get("cilj"),
      grupaIds: forma.getAll("grupaIds"),
    });

  if (!rezultat.success) {
    return {
      greska: rezultat.error.issues[0].message,
    };
  }

  const p = rezultat.data;
  const rok = lokalnoUTrenutak(p.datum, p.vrijeme);

  if (
    isoDatum(rok) !== p.datum ||
    formatVrijeme(rok) !== p.vrijeme
  ) {
    return {
      greska: t("validation.invalidLocalTime"),
    };
  }

  return {
    podaci: {
      naslov: p.naslov,
      opis: p.opis,
      rok,
      max_bodova: p.max_bodova,
      nacini_predaje: p.nacini_predaje,
      dopusti_kasnu_predaju: p.dopusti_kasnu_predaju,
      za_cijeli_kolegij: p.cilj === "cijeli_kolegij",
      grupaIds: p.grupaIds,
    },
  };
}

export async function noviZadatakAkcija(
  kolegijId: string,
  _: Stanje,
  forma: FormData,
): Promise<Stanje> {
  await zahtijevajNastavnika(kolegijId);

  const locale = jezikObrasca(forma);
  const t = await getTranslations({
    locale,
    namespace: "teacherAssignmentForm",
  });

  const rezultat = procitajZadatak(forma, t);

  if ("greska" in rezultat) {
    return { greska: rezultat.greska };
  }

  let id: string;

  try {
    id = await upit((tx) =>
      kreirajZadatak(tx, kolegijId, rezultat.podaci),
    );
  } catch (e) {
    return {
      greska: porukaGreske(
        e,
        await getTranslations({ locale, namespace: "errors" }),
      ),
    };
  }

  revalidatePath(`/nastava/${kolegijId}/zadaci`);

  // Važno: redirect se nalazi izvan try/catch jer Next.js
  // koristi vlastiti signal za izvršavanje redirekcije.
  redirect(
    `${prefiksJezika(locale)}/nastava/${kolegijId}/zadaci/${id}`,
  );
}

export async function urediZadatakAkcija(
  kolegijId: string,
  zadatakId: string,
  _: Stanje,
  forma: FormData,
): Promise<Stanje> {
  await zahtijevajNastavnika(kolegijId);

  const locale = jezikObrasca(forma);
  const t = await getTranslations({
    locale,
    namespace: "teacherAssignmentForm",
  });

  const id = z.uuid().safeParse(zadatakId);

  if (!id.success) {
    return { greska: t("validation.invalidAssignment") };
  }

  const rezultat = procitajZadatak(forma, t);

  if ("greska" in rezultat) {
    return { greska: rezultat.greska };
  }

  try {
    await upit((tx) =>
      urediZadatak(
        tx,
        kolegijId,
        id.data,
        rezultat.podaci,
      ),
    );
  } catch (e) {
    return {
      greska: porukaGreske(
        e,
        await getTranslations({ locale, namespace: "errors" }),
      ),
    };
  }

  revalidatePath(`/nastava/${kolegijId}/zadaci`);
  revalidatePath(`/nastava/${kolegijId}/zadaci/${id.data}`);

  return { ok: t("updated") };
}

export async function objaviZadatakAkcija(
  kolegijId: string,
  zadatakId: string,
  _: Stanje,
  forma: FormData,
): Promise<Stanje> {
  await zahtijevajNastavnika(kolegijId);

  const locale = jezikObrasca(forma);
  const t = await getTranslations({
    locale,
    namespace: "teacherAssignmentForm",
  });

  const id = z.uuid().safeParse(zadatakId);

  if (!id.success) {
    return { greska: t("validation.invalidAssignment") };
  }

  try {
    await upit((tx) =>
      objaviZadatak(tx, kolegijId, id.data),
    );
  } catch (e) {
    return {
      greska: porukaGreske(
        e,
        await getTranslations({ locale, namespace: "errors" }),
      ),
    };
  }

  revalidatePath(`/nastava/${kolegijId}/zadaci`);
  revalidatePath(`/nastava/${kolegijId}/zadaci/${id.data}`);

  return { ok: t("publishedSuccessfully") };
}