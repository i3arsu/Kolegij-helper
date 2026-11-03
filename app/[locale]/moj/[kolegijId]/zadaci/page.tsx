
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

import {
  Naslov,
  Oznaka,
} from "@/components/ui";

import {
  KLJUC_STATUSA,
  TON_STATUSA,
} from "@/lib/domena/statusi";

import { formatBroj } from "@/lib/domena/broj";

import {
  formatDatumDan,
  formatVrijeme,
} from "@/lib/domena/vrijeme";

import { upit } from "@/lib/auth/guard";
import { zadaciStudenta } from "@/lib/servisi/zadaci-studenta";

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

  const jezik = locale === "en" ? "en" : "hr";

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
                      <Oznaka ton={TON_STATUSA[status]}>
                        {t(KLJUC_STATUSA[status])}
                      </Oznaka>

                      {zadatak.kasni && (
                        <Oznaka ton="upozorenje">
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
                        ? `${formatDatumDan(rok, jezik)} ${formatVrijeme(rok)}`
                        : "—"}
                    </p>

                    <p>
                      {t("points")}:{" "}
                      {zadatak.bodovi === null
                        ? "—"
                        : formatBroj(zadatak.bodovi, locale)}
                      {" / "}
                      {formatBroj(zadatak.max_bodova, locale)}
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