
"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { sql } from "kysely";
import { z } from "zod";

import {
  formatVrijeme,
  isoDatum,
  lokalnoUTrenutak,
} from "@/lib/domena/vrijeme";

import { jezikObrasca } from "@/i18n/obrazac";
import {
  upit,
  zahtijevajOsoblje,
  zahtijevajNastavnika
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

  const ids = z
    .object({
      kolegijId: z.uuid(),
      zadatakId: z.uuid(),
      predajaId: z.uuid(),
    })
    .safeParse({
      kolegijId,
      zadatakId,
      predajaId,
    });

  if (!ids.success) {
    return { greska: errors("invalidData") };
  }

  await zahtijevajOsoblje(kolegijId);

  try {
    await upit(async (tx) => {
      // Provjeravamo da predaja pripada upravo ovom
      // kolegiju i zadatku te da je dostupna kroz RLS.
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

  // Osvježava i stranicu pregleda i tablicu predaja.
  revalidatePath(`/nastava/${kolegijId}`, "layout");

  return {
    ok: t(
      operacija === "preuzmi"
        ? "claimSuccess"
        : "releaseSuccess",
    ),
  };
}


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

  // Validamos primero los identificadores.
  const ids = z
    .object({
      kolegijId: z.uuid(),
      zadatakId: z.uuid(),
      predajaId: z.uuid(),
    })
    .safeParse({
      kolegijId,
      zadatakId,
      predajaId,
    });

  if (!ids.success) {
    return { greska: errors("invalidData") };
  }

  // Validamos los campos del formulario.
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
      greska: rezultat.error.issues[0]?.message
        ?? errors("invalidData"),
    };
  }

  const p = rezultat.data;

  // Los puntos son obligatorios al aceptar.
  const bodoviTekst = p.bodovi?.trim() ?? "";

  const bodovi = bodoviTekst === ""
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

  // El plazo de revisión es opcional, pero requiere
  // fecha y hora conjuntamente.
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

      // Detectamos fechas u horas locales inexistentes,
      // por ejemplo, durante el cambio al horario de verano.
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

  // Solo el personal autorizado puede ejecutar la acción.
  await zahtijevajOsoblje(kolegijId);

  try {
    await upit(async (tx) => {
      // Verificamos que la entrega pertenezca al curso
      // y al ejercicio indicados y sea visible por RLS.
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

      // La función SQL comprueba que quien califica
      // sea propietario de la reclamación activa.
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

  const ids = z
    .object({
      kolegijId: z.uuid(),
      zadatakId: z.uuid(),
      predajaId: z.uuid(),
    })
    .safeParse({
      kolegijId,
      zadatakId,
      predajaId,
    });

  if (!ids.success) {
    return { greska: errors("invalidData") };
  }

  // Esta operación está reservada exclusivamente al profesor.
  await zahtijevajNastavnika(kolegijId);

  try {
    await upit(async (tx) => {
      // Comprobamos que la entrega pertenece al curso y ejercicio.
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

      // PostgreSQL vuelve a comprobar el rol y el estado.
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

  // Actualizamos la pantalla de revisión y las páginas relacionadas.
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