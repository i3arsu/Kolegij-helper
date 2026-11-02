
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  GumbLink,
  Kartica,
  Naslov,
  Oznaka,
} from "@/components/ui";

import { formatDatumVrijeme } from "@/lib/domena/vrijeme";
import { upit } from "@/lib/auth/guard";
import { mozeStudentPredati } from "@/lib/domena/statusi";
import type { StatusPredaje } from "@/lib/db/tipovi";

import {
  zadatakStudenta,
  povijestPredaje,
} from "@/lib/servisi/zadaci-studenta";

import { FormaPredaje } from "./forma-predaje";

const statusi: Record<
  StatusPredaje,
  {
    ton: "neutralno" | "uspjeh" | "upozorenje" | "greska";
  }
> = {
  nije_predano: { ton: "neutralno" },
  predano: { ton: "neutralno" },
  u_pregledu: { ton: "upozorenje" },
  vraceno_na_doradu: { ton: "upozorenje" },
  prihvaceno: { ton: "uspjeh" },
};

function formatVelicina(velicina: number | string | bigint) {
  const bajtovi = Number(velicina);

  if (bajtovi < 1024) {
    return `${bajtovi} B`;
  }

  if (bajtovi < 1024 * 1024) {
    return `${(bajtovi / 1024).toFixed(1)} KB`;
  }

  return `${(bajtovi / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DetaljiZadatkaStudenta({
  params,
}: PageProps<"/[locale]/moj/[kolegijId]/zadaci/[zadatakId]">) {
  const { kolegijId, zadatakId } = await params;

  if (!z.uuid().safeParse(zadatakId).success) {
    notFound();
  }

  const rezultat = await upit(async (tx, profil) => {
    const zadatak = await zadatakStudenta(
      tx,
      kolegijId,
      profil.student!.id,
      zadatakId,
    );

    if (!zadatak) {
      return null;
    }

    const povijest = await povijestPredaje(
      tx,
      kolegijId,
      profil.student!.id,
      zadatakId,
    );

    return {
      zadatak,
      povijest,
    };
  });

  if (!rezultat) {
    notFound();
  }

  const { zadatak, povijest } = rezultat;

  const t = await getTranslations("studentAssignments");
  const locale = await getLocale();
  const jezik = locale === "en" ? "en" : "hr";

  const status: StatusPredaje =
    zadatak.status ?? "nije_predano";

  const nazivStatusa: Record<StatusPredaje, string> = {
    nije_predano: t("statuses.nije_predano"),
    predano: t("statuses.predano"),
    u_pregledu: t("statuses.u_pregledu"),
    vraceno_na_doradu: t("statuses.vraceno_na_doradu"),
    prihvaceno: t("statuses.prihvaceno"),
  };

  const zadnjaVerzija = povijest[povijest.length - 1];

  // Određujemo rok koji vrijedi za sljedeću predaju.
  let rokZaPredaju: Date | null = null;
  let rokProsao = false;

  if (status === "nije_predano") {
    rokZaPredaju = zadatak.rok_efektivni;
    rokProsao = zadatak.rok_prosao ?? false;
  } else if (status === "predano") {
    rokZaPredaju =
      zadnjaVerzija?.rok_verzije ??
      zadatak.rok_efektivni;

    rokProsao =
      zadnjaVerzija?.rok_verzije != null
        ? zadnjaVerzija.rok_verzije_prosao
        : zadatak.rok_prosao ?? false;
  } else if (status === "vraceno_na_doradu") {
    rokZaPredaju =
      zadnjaVerzija?.rok_dorade ?? null;

    rokProsao =
      zadnjaVerzija?.rok_dorade_prosao ?? false;
  }

  const mozePredati =
    mozeStudentPredati(status) &&
    (zadatak.dopusti_kasnu_predaju || !rokProsao);

  const vrstaPredaje =
    status === "nije_predano"
      ? "prva"
      : status === "predano"
        ? "zamjena"
        : "dorada";

  const metode = zadatak.nacini_predaje.map((metoda) => {
    if (metoda === "datoteka") {
      return t("methodFile");
    }

    if (metoda === "link") {
      return t("methodLink");
    }

    if (metoda === "tekst") {
      return t("methodText");
    }

    return metoda;
  });

  return (
    <div className="space-y-4">
      <Naslov
        podnaslov={t("detailsTitle")}
        akcije={
          <GumbLink href={`/moj/${kolegijId}/zadaci`}>
            {t("backToList")}
          </GumbLink>
        }
      >
        {zadatak.naslov}
      </Naslov>

      {/* Detalji zadatka */}
      <Kartica naslov={t("detailsTitle")}>
        <div className="space-y-4">
          <div>
            <Oznaka ton={statusi[status].ton}>
              {nazivStatusa[status]}
            </Oznaka>

            {zadatak.kasni && (
              <span className="ml-2">
                <Oznaka ton="upozorenje">
                  {t("late")}
                </Oznaka>
              </span>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium">
              {t("description")}
            </h3>

            <p className="mt-1 whitespace-pre-wrap text-sm">
              {zadatak.opis || "—"}
            </p>
          </div>

          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium">
                {t("originalDeadline")}
              </dt>

              <dd className="mt-1">
                {formatDatumVrijeme(
                  zadatak.izvorni_rok,
                  jezik,
                )}
              </dd>
            </div>

            {rokZaPredaju && (
              <div>
                <dt className="font-medium">
                  {t("effectiveDeadline")}
                </dt>

                <dd className="mt-1">
                  {formatDatumVrijeme(rokZaPredaju, jezik)}
                </dd>
              </div>
            )}

            <div>
              <dt className="font-medium">
                {t("maxPoints")}
              </dt>

              <dd className="mt-1">
                {Number(zadatak.max_bodova)}
              </dd>
            </div>

            {zadatak.bodovi !== null && (
              <div>
                <dt className="font-medium">
                  {t("points")}
                </dt>

                <dd className="mt-1">
                  {Number(zadatak.bodovi)} /{" "}
                  {Number(zadatak.max_bodova)}
                </dd>
              </div>
            )}

            <div>
              <dt className="font-medium">
                {t("methods")}
              </dt>

              <dd className="mt-1">
                {metode.join(", ")}
              </dd>
            </div>
          </dl>

          {rokProsao && (
            <p className="text-sm text-amber-700">
              {t("deadlinePassed")}
            </p>
          )}
        </div>
      </Kartica>

      {/* Materijali priloženi zadatku */}
      <Kartica naslov={t("taskFiles")}>
        {zadatak.prilozi.length === 0 ? (
          <p className="text-sm text-gray-500">
            {t("noFiles")}
          </p>
        ) : (
          <ul className="space-y-3">
            {zadatak.prilozi.map((prilog) => (
              <li
                key={prilog.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {prilog.naziv}
                  </p>

                  <p className="text-xs text-gray-500">
                    {formatVelicina(prilog.velicina)}
                  </p>
                </div>

                <a
                  href={`/api/datoteke/${prilog.id}?locale=${encodeURIComponent(locale)}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {t("download")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Kartica>

      {/* Slanje ili zamjena predaje */}
      {mozePredati && (
        <FormaPredaje
          zadatakId={zadatakId}
          locale={locale}
          naciniPredaje={zadatak.nacini_predaje}
          vrsta={vrstaPredaje}
          pocetniTekst={
            status === "predano"
              ? zadnjaVerzija?.tekst
              : null
          }
          pocetnaPoveznica={
            status === "predano"
              ? zadnjaVerzija?.link
              : null
          }
        />
      )}

      {status === "u_pregledu" && (
        <Kartica naslov={t("submissionStatus")}>
          <p className="text-sm">
            {t("lockedInReview")}
          </p>
        </Kartica>
      )}

      {status === "prihvaceno" && (
        <Kartica naslov={t("submissionStatus")}>
          <p className="text-sm">
            {t("lockedAccepted")}
          </p>
        </Kartica>
      )}

      {!mozePredati &&
        mozeStudentPredati(status) && (
          <Kartica naslov={t("submissionStatus")}>
            <p className="text-sm text-amber-700">
              {t("submissionClosed")}
            </p>
          </Kartica>
        )}

      {/* Povijest predaja */}
      <Kartica naslov={t("historyTitle")}>
        {povijest.length === 0 ? (
          <p className="text-sm text-gray-500">
            {t("noHistory")}
          </p>
        ) : (
          <div className="space-y-6">
            {povijest.map((verzija) => {
              const odluka =
                verzija.odluka === "prihvaceno"
                  ? t("feedbackAccepted")
                  : verzija.odluka === "vraceno_na_doradu"
                    ? t("feedbackReturned")
                    : null;

              return (
                <div
                  key={verzija.verzija_id}
                  className="space-y-3 border-b border-gray-200 pb-5 last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">
                      {t("version")} {verzija.broj}
                    </h3>

                    <span className="text-sm text-gray-500">
                        {verzija.predano_at ? formatDatumVrijeme(verzija.predano_at, jezik) : "—"}
                    </span>
                  </div>

                  {verzija.kasni && (
                    <Oznaka ton="upozorenje">
                      {t("late")}
                    </Oznaka>
                  )}

                  {verzija.tekst && (
                    <div>
                      <h4 className="text-sm font-medium">
                        {t("submissionText")}
                      </h4>

                      <p className="mt-1 whitespace-pre-wrap text-sm">
                        {verzija.tekst}
                      </p>
                    </div>
                  )}

                  {verzija.link && (
                    <div>
                      <h4 className="text-sm font-medium">
                        {t("submissionLink")}
                      </h4>

                      <a
                        href={verzija.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block break-all text-sm text-blue-600 hover:underline"
                      >
                        {verzija.link}
                      </a>
                    </div>
                  )}

                  {verzija.datoteke.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium">
                        {t("files")}
                      </h4>

                      <ul className="mt-2 space-y-2">
                        {verzija.datoteke.map((datoteka) => (
                          <li key={datoteka.id}>
                            <a
                              href={`/api/datoteke/${datoteka.id}?locale=${encodeURIComponent(locale)}`}
                              className="text-sm text-blue-600 hover:underline"
                            >
                              {datoteka.naziv}
                            </a>

                            <span className="ml-2 text-xs text-gray-500">
                              {formatVelicina(datoteka.velicina)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {odluka && (
                    <div className="space-y-2 rounded-lg bg-gray-50 p-4">
                      <h4 className="font-medium">
                        {t("feedbackTitle")}
                      </h4>

                      <Oznaka
                        ton={
                          verzija.odluka === "prihvaceno"
                            ? "uspjeh"
                            : "upozorenje"
                        }
                      >
                        {odluka}
                      </Oznaka>

                      {verzija.komentar && (
                        <p className="whitespace-pre-wrap text-sm">
                          {verzija.komentar}
                        </p>
                      )}

                      {verzija.bodovi !== null && (
                        <p className="text-sm">
                          {t("points")}: {Number(verzija.bodovi)}
                        </p>
                      )}

                      {verzija.rok_dorade && (
                        <p className="text-sm">
                          {t("revisionDeadline")}:{" "}
                          {formatDatumVrijeme(
                            verzija.rok_dorade,
                            jezik,
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Kartica>
    </div>
  );
}