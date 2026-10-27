
"use server";

import { revalidatePath } from "next/cache";
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
import {
  formatVrijeme,
  isoDatum,
  lokalnoUTrenutak,
} from "@/lib/domena/vrijeme";
import { porukaGreske } from "@/lib/http/greske";
import {
  spremiProduzenjeRoka,
  ukloniProduzenjeRoka,
} from "@/lib/servisi/produzenja-roka";

export type StanjeProduzenjaRoka = {
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

function tekstObrasca(
  forma: FormData,
  naziv: string,
): string {
  const vrijednost = forma.get(naziv);

  return typeof vrijednost === "string"
    ? vrijednost
    : "";
}

function putanjaZadatka(
  locale: string,
  kolegijId: string,
  zadatakId: string,
): string {
  return (
    `${prefiksJezika(locale)}` +
    `/nastava/${kolegijId}/zadaci/${zadatakId}`
  );
}

export async function spremiProduzenjeRokaAkcija(
  kolegijId: string,
  zadatakId: string,
  studentId: string,
  _prethodnoStanje: StanjeProduzenjaRoka,
  forma: FormData,
): Promise<StanjeProduzenjaRoka> {
  await zahtijevajNastavnika(kolegijId);

  const locale = jezikObrasca(forma);

  const t = await getTranslations({
    locale,
    namespace: "teacherDeadlineExtensions",
  });

  const id = z
    .object({
      zadatakId: z.uuid(),
      studentId: z.uuid(),
    })
    .safeParse({
      zadatakId,
      studentId,
    });

  if (!id.success) {
    return {
      greska: t("validation.invalidAssignment"),
    };
  }

  const p = z
    .object({
      datum: z
        .string()
        .refine(
          datumValjan,
          t("validation.invalidDate"),
        ),
      vrijeme: z
        .string()
        .regex(
          /^(?:[01]\d|2[0-3]):[0-5]\d$/,
          t("validation.invalidTime"),
        ),
      razlog: z
        .string()
        .trim()
        .max(500, t("validation.reasonMax"))
        .transform((vrijednost) =>
          vrijednost || null,
        ),
    })
    .safeParse({
      datum: tekstObrasca(forma, "datum"),
      vrijeme: tekstObrasca(forma, "vrijeme"),
      razlog: tekstObrasca(forma, "razlog"),
    });

  if (!p.success) {
    return {
      greska: p.error.issues[0].message,
    };
  }

  const noviRok = lokalnoUTrenutak(
    p.data.datum,
    p.data.vrijeme,
  );

  // Provjeravamo valjanost vremena u vremenskoj zoni Zagreba.
  if (
    isoDatum(noviRok) !== p.data.datum ||
    formatVrijeme(noviRok) !== p.data.vrijeme
  ) {
    return {
      greska: t("validation.invalidLocalTime"),
    };
  }

  try {
    const rezultat = await upit(async (tx, profil) => {
      // Provjeravamo da je zadatak dodijeljen studentu
      // i dohvaćamo izvorni rok bez postojeće izmjene.
      const dodjela = await tx
        .selectFrom("v_predaja as vp")
        .innerJoin(
          "zadatak as z",
          "z.id",
          "vp.zadatak_id",
        )
        .select("z.rok as izvorni_rok")
        .where("vp.kolegij_id", "=", kolegijId)
        .where(
          "vp.zadatak_id",
          "=",
          id.data.zadatakId,
        )
        .where(
          "vp.student_id",
          "=",
          id.data.studentId,
        )
        .executeTakeFirst();

      if (!dodjela) {
        return "studentUnavailable" as const;
      }

      // Novo produljenje mora biti strogo nakon izvornog roka.
      // Tako sprječavamo slučajno skraćivanje roka studentu.
      if (
        noviRok.getTime() <=
        dodjela.izvorni_rok.getTime()
      ) {
        return "mustBeAfterDeadline" as const;
      }

      await spremiProduzenjeRoka(tx, {
        zadatak_id: id.data.zadatakId,
        student_id: id.data.studentId,
        novi_rok: noviRok,
        razlog: p.data.razlog,

        // ID dolazi iz autentificirane sesije, ne iz obrasca.
        odobrio: profil.korisnikId,
      });

      return "saved" as const;
    });

    if (rezultat === "studentUnavailable") {
      return {
        greska: t("validation.studentUnavailable"),
      };
    }

    if (rezultat === "mustBeAfterDeadline") {
      return {
        greska: t("validation.mustBeAfterDeadline"),
      };
    }
  } catch (e) {
    return {
      greska: porukaGreske(
        e,
        await getTranslations({
          locale,
          namespace: "errors",
        }),
      ),
    };
  }

  revalidatePath(
    putanjaZadatka(
      locale,
      kolegijId,
      id.data.zadatakId,
    ),
  );

  return {
    ok: t("saved"),
  };
}

export async function ukloniProduzenjeRokaAkcija(
  kolegijId: string,
  zadatakId: string,
  studentId: string,
  _prethodnoStanje: StanjeProduzenjaRoka,
  forma: FormData,
): Promise<StanjeProduzenjaRoka> {
  await zahtijevajNastavnika(kolegijId);

  const locale = jezikObrasca(forma);

  const t = await getTranslations({
    locale,
    namespace: "teacherDeadlineExtensions",
  });

  const id = z
    .object({
      zadatakId: z.uuid(),
      studentId: z.uuid(),
    })
    .safeParse({
      zadatakId,
      studentId,
    });

  if (!id.success) {
    return {
      greska: t("validation.invalidAssignment"),
    };
  }

  try {
    const uklonjeno = await upit(async (tx) => {
      const zadatak = await tx
        .selectFrom("zadatak")
        .select("id")
        .where("id", "=", id.data.zadatakId)
        .where("kolegij_id", "=", kolegijId)
        .executeTakeFirst();

      if (!zadatak) {
        return false;
      }

      await ukloniProduzenjeRoka(
        tx,
        id.data.zadatakId,
        id.data.studentId,
      );

      return true;
    });

    if (!uklonjeno) {
      return {
        greska: t("validation.invalidAssignment"),
      };
    }
  } catch (e) {
    return {
      greska: porukaGreske(
        e,
        await getTranslations({
          locale,
          namespace: "errors",
        }),
      ),
    };
  }

  revalidatePath(
    putanjaZadatka(
      locale,
      kolegijId,
      id.data.zadatakId,
    ),
  );

  return {
    ok: t("removed"),
  };
}