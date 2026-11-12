
"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { sql } from "kysely";
import { z } from "zod";

import type { Tx } from "@/lib/db/klijent";

import {
  formatVrijeme,
  isoDatum,
  lokalnoUTrenutak,
} from "@/lib/domena/vrijeme";

import { jezikObrasca } from "@/i18n/obrazac";

import {
  upit,
  zahtijevajOsoblje,
  zahtijevajNastavnika,
} from "@/lib/auth/guard";

import {
  GreskaAplikacije,
  porukaGreske,
} from "@/lib/http/greske";

export type StanjePregleda = {
  greska?: string;
  ok?: string;
};

type OperacijaPregleda = "preuzmi" | "otpusti";

// Jedinstvena validacija identifikatora.
const idsPredajeSchema = z.object({
  kolegijId: z.uuid(),
  zadatakId: z.uuid(),
  predajaId: z.uuid(),
});

// Provjera svih identifikatora prije izvršavanja akcije.
function idsPredajeSuValjani(
  kolegijId: string,
  zadatakId: string,
  predajaId: string,
): boolean {
  return idsPredajeSchema.safeParse({
    kolegijId,
    zadatakId,
    predajaId,
  }).success;
}

// Provjerava pripada li predaja zadanom kolegiju i zadatku.
// Upit koristi v_predaja, pa se primjenjuju postojeća RLS pravila.
async function provjeriPredaju(
  tx: Tx,
  kolegijId: string,
  zadatakId: string,
  predajaId: string,
): Promise<void> {
  const dostupna = await tx
    .selectFrom("v_predaja")
    .select("predaja_id")
    .where("kolegij_id", "=", kolegijId)
    .where("zadatak_id", "=", zadatakId)
    .where("predaja_id", "=", predajaId)
    .executeTakeFirst();

  if (!dostupna?.predaja_id) {
    throw new GreskaAplikacije("assignmentNotFound");
  }
}

// Zajednička implementacija preuzimanja i otpuštanja pregleda.
async function izvrsiAkcijuPregleda(
  kolegijId: string,
  zadatakId: string,
  predajaId: string,
  forma: FormData,
  operacija: OperacijaPregleda,
): Promise<StanjePregleda> {
  const locale = jezikObrasca(forma);

  const t = await getTranslations({
    locale,
    namespace: "teacherSubmissionReview",
  });

  const errors = await getTranslations({
    locale,
    namespace: "errors",
  });

  if (
    !idsPredajeSuValjani(
      kolegijId,
      zadatakId,
      predajaId,
    )
  ) {
    return {
      greska: errors("invalidData"),
    };
  }

  await zahtijevajOsoblje(kolegijId);

  try {
    await upit(async (tx) => {
      await provjeriPredaju(
        tx,
        kolegijId,
        zadatakId,
        predajaId,
      );

      if (operacija === "preuzmi") {
        await sql`
          select private.preuzmi_pregled(
            ${predajaId}::uuid
          )
        `.execute(tx);
      } else {
        await sql`
          select private.otpusti_pregled(
            ${predajaId}::uuid
          )
        `.execute(tx);
      }
    });
  } catch (greska) {
    return {
      greska: porukaGreske(greska, errors),
    };
  }

  // Osvježava stranicu pregleda i povezane stranice.
  revalidatePath(`/nastava/${kolegijId}`, "layout");

  return {
    ok: t(
      operacija === "preuzmi"
        ? "claimSuccess"
        : "releaseSuccess",
    ),
  };
}

// Ocjenjivanje predaje.
export async function ocijeniPregledAkcija(
  kolegijId: string,
  zadatakId: string,
  predajaId: string,
  _: StanjePregleda,
  forma: FormData,
): Promise<StanjePregleda> {
  const locale = jezikObrasca(forma);

  const t = await getTranslations({
    locale,
    namespace: "teacherSubmissionReview",
  });

  const errors = await getTranslations({
    locale,
    namespace: "errors",
  });

  if (
    !idsPredajeSuValjani(
      kolegijId,
      zadatakId,
      predajaId,
    )
  ) {
    return {
      greska: errors("invalidData"),
    };
  }

  // Validacija polja obrasca.
  const rezultat = z
    .object({
      odluka: z.enum([
        "vraceno_na_doradu",
        "prihvaceno",
      ]),
      komentar: z
        .string()
        .trim()
        .min(1, t("validation.commentRequired"))
        .max(5000, t("validation.commentTooLong")),
      bodovi: z.string().optional(),
      datum_dorade: z.string().optional(),
      vrijeme_dorade: z.string().optional(),
    })
    .safeParse(Object.fromEntries(forma));

  if (!rezultat.success) {
    return {
      greska:
        rezultat.error.issues[0]?.message ??
        errors("invalidData"),
    };
  }

  const p = rezultat.data;

  // Bodovi su obavezni prilikom prihvaćanja predaje.
  const bodoviTekst = p.bodovi?.trim() ?? "";

  const bodovi =
    bodoviTekst === ""
      ? null
      : Number(bodoviTekst);

  if (
    bodovi !== null &&
    (!Number.isFinite(bodovi) || bodovi < 0)
  ) {
    return {
      greska: t("validation.invalidPoints"),
    };
  }

  if (
    p.odluka === "prihvaceno" &&
    bodovi === null
  ) {
    return {
      greska: t("validation.pointsRequired"),
    };
  }

  // Rok dorade je neobavezan, ali zahtijeva datum i vrijeme.
  const datum = p.datum_dorade?.trim() ?? "";
  const vrijeme = p.vrijeme_dorade?.trim() ?? "";

  if (Boolean(datum) !== Boolean(vrijeme)) {
    return {
      greska: t("validation.dateAndTimeRequiredTogether"),
    };
  }

  if (
    p.odluka === "prihvaceno" &&
    (datum || vrijeme)
  ) {
    return {
      greska: t("validation.deadlineOnlyForReturn"),
    };
  }

  let rokDorade: Date | null = null;

  if (datum && vrijeme) {
    if (!z.iso.date().safeParse(datum).success) {
      return {
        greska: t("validation.invalidDate"),
      };
    }

    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(vrijeme)) {
      return {
        greska: t("validation.invalidTime"),
      };
    }

    try {
      rokDorade = lokalnoUTrenutak(datum, vrijeme);

      // Provjera lokalnog vremena tijekom promjene ljetnog računanja.
      if (
        isoDatum(rokDorade) !== datum ||
        formatVrijeme(rokDorade) !== vrijeme
      ) {
        return {
          greska: t("validation.invalidLocalTime"),
        };
      }
    } catch {
      return {
        greska: t("validation.invalidLocalTime"),
      };
    }
  }

  await zahtijevajOsoblje(kolegijId);

  try {
    await upit(async (tx) => {
      await provjeriPredaju(
        tx,
        kolegijId,
        zadatakId,
        predajaId,
      );

      // SQL funkcija provjerava vlasništvo nad aktivnim pregledom.
      await sql`
        select private.ocijeni(
          ${predajaId}::uuid,
          ${p.odluka}::text,
          ${p.komentar}::text,
          ${bodovi}::numeric,
          ${rokDorade}::timestamptz
        )
      `.execute(tx);
    });
  } catch (greska) {
    return {
      greska: porukaGreske(greska, errors),
    };
  }

  revalidatePath(
    `/nastava/${kolegijId}/zadaci/${zadatakId}/predaje/${predajaId}`,
  );

  revalidatePath(
    `/nastava/${kolegijId}/zadaci/${zadatakId}`,
  );

  return {
    ok: t(
      p.odluka === "prihvaceno"
        ? "acceptedSuccess"
        : "returnedSuccess",
    ),
  };
}

// Preuzimanje pregleda.
export async function preuzmiPregledAkcija(
  kolegijId: string,
  zadatakId: string,
  predajaId: string,
  _: StanjePregleda,
  forma: FormData,
): Promise<StanjePregleda> {
  return izvrsiAkcijuPregleda(
    kolegijId,
    zadatakId,
    predajaId,
    forma,
    "preuzmi",
  );
}

// Otpuštanje pregleda.
export async function otpustiPregledAkcija(
  kolegijId: string,
  zadatakId: string,
  predajaId: string,
  _: StanjePregleda,
  forma: FormData,
): Promise<StanjePregleda> {
  return izvrsiAkcijuPregleda(
    kolegijId,
    zadatakId,
    predajaId,
    forma,
    "otpusti",
  );
}

// Ponovno otvaranje predaje.
export async function ponovnoOtvoriPredajuAkcija(
  kolegijId: string,
  zadatakId: string,
  predajaId: string,
  _: StanjePregleda,
  forma: FormData,
): Promise<StanjePregleda> {
  const locale = jezikObrasca(forma);

  const t = await getTranslations({
    locale,
    namespace: "teacherSubmissionReview",
  });

  const errors = await getTranslations({
    locale,
    namespace: "errors",
  });

  if (
    !idsPredajeSuValjani(
      kolegijId,
      zadatakId,
      predajaId,
    )
  ) {
    return {
      greska: errors("invalidData"),
    };
  }

  // Ponovno otvaranje je dopušteno isključivo nastavniku.
  await zahtijevajNastavnika(kolegijId);

  try {
    await upit(async (tx) => {
      await provjeriPredaju(
        tx,
        kolegijId,
        zadatakId,
        predajaId,
      );

      // PostgreSQL ponovno provjerava ulogu i stanje predaje.
      await sql`
        select private.ponovno_otvori(
          ${predajaId}::uuid
        )
      `.execute(tx);
    });
  } catch (greska) {
    return {
      greska: porukaGreske(greska, errors),
    };
  }

  revalidatePath(
    `/nastava/${kolegijId}/zadaci/${zadatakId}/predaje/${predajaId}`,
  );

  revalidatePath(
    `/nastava/${kolegijId}/zadaci/${zadatakId}`,
  );

  revalidatePath(`/nastava/${kolegijId}`, "layout");

  return {
    ok: t("reopenSuccess"),
  };
}