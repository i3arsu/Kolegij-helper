
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

import {
  Naslov,
  Oznaka,
} from "@/components/ui";

import type { StatusPredaje } from "@/lib/db/tipovi";

import {
  formatDatumDan,
  formatVrijeme,
} from "@/lib/domena/vrijeme";

import { upit } from "@/lib/auth/guard";
import { zadaciStudenta } from "@/lib/servisi/zadaci-studenta";

const statusi: Record<StatusPredaje, {
  ton: "neutralno" | "uspjeh" | "upozorenje" | "greska";
}> = {
  nije_predano: {
    ton: "neutralno",
  },
  predano: {
    ton: "neutralno",
  },
  u_pregledu: {
    ton: "upozorenje",
  },
  vraceno_na_doradu: {
    ton: "upozorenje",
  },
  prihvaceno: {
    ton: "uspjeh",
  },
};

export default async function ZadaciStudenta({
  params,
}: PageProps<"/[locale]/moj/[kolegijId]/zadaci">) {
  const { kolegijId, locale } = await params;

  const t = await getTranslations({
    locale,
    namespace: "studentAssignments",
  });

  const zadaci = await upit((tx, profil) =>
    zadaciStudenta(
      tx,
      kolegijId,
      profil.student!.id,
    ),
  );

  const naziviStatusa: Record<StatusPredaje, string> = {
        nije_predano: t("statuses.nije_predano"),
        predano: t("statuses.predano"),
        u_pregledu: t("statuses.u_pregledu"),
        vraceno_na_doradu: t("statuses.vraceno_na_doradu"),
        prihvaceno: t("statuses.prihvaceno"),
    };

  const formatBroj = (vrijednost: string | number) =>
    new Intl.NumberFormat(
      locale === "en" ? "en" : "hr",
      { maximumFractionDigits: 2 },
    ).format(Number(vrijednost));

  return (
    <>
      <Naslov podnaslov={t("subtitle")}>
        {t("title")}
      </Naslov>

      {zadaci.length === 0 ? (
        <p className="text-sm text-tekst-slab">
          {t("empty")}
        </p>
      ) : (
        <ul className="grid gap-3">
          {zadaci.map((zadatak) => {
            const status = zadatak.status ?? "nije_predano";
            const opisStatusa = statusi[status];

            const rok = zadatak.rok_efektivni;

            return (
              <li key={zadatak.id}>
                <Link
                  href={`/moj/${kolegijId}/zadaci/${zadatak.id}`}
                  className="block rounded-lg border border-rub bg-povrsina p-4 transition-colors hover:border-naglasak"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="font-semibold">
                      {zadatak.naslov}
                    </h2>

                    <div className="flex flex-wrap gap-2">
                      <Oznaka ton={opisStatusa.ton}>
                        {naziviStatusa[status]}
                      </Oznaka>

                      {zadatak.kasni && (
                        <Oznaka ton="greska">
                          {t("late")}
                        </Oznaka>
                      )}

                      {zadatak.rok_prosao &&
                        status === "nije_predano" && (
                          <Oznaka ton="upozorenje">
                            {t("deadlinePassed")}
                          </Oznaka>
                        )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-tekst-slab">
                    <p>
                      {t("deadline")}:{" "}
                      {rok
                        ? `${formatDatumDan(rok, locale === "en" ? "en" : "hr")} ${formatVrijeme(rok)}`
                        : "—"}
                    </p>

                    <p>
                      {t("points")}:{" "}
                      {zadatak.bodovi === null
                        ? "—"
                        : formatBroj(zadatak.bodovi)}
                      {" / "}
                      {formatBroj(zadatak.max_bodova)}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}