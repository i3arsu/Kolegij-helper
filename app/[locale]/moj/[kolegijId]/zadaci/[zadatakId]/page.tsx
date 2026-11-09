
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  GumbLink,
  Kartica,
  Naslov,
  Oznaka,
} from "@/components/ui";

import { upit } from "@/lib/auth/guard";

import { formatBroj } from "@/lib/domena/broj";
import { formatVelicina } from "@/lib/domena/datoteke";
import {
  KLJUC_STATUSA,
  mozeStudentPredati,
  TON_STATUSA,
} from "@/lib/domena/statusi";
import { formatDatumVrijeme } from "@/lib/domena/vrijeme";

import type { StatusPredaje } from "@/lib/db/tipovi";

import {
  povijestPredaje,
  zadatakStudenta,
} from "@/lib/servisi/zadaci-studenta";

import { FormaPredaje } from "./forma-predaje";

const idsSchema = z.object({
  kolegijId: z.uuid(),
  zadatakId: z.uuid(),
});

export default async function DetaljiZadatkaStudenta({
  params,
}: PageProps<"/[locale]/moj/[kolegijId]/zadaci/[zadatakId]">) {
  // Parametri rute.
  const { kolegijId, zadatakId } = await params;

  // Validacija identifikatora.
  const idsValidni = idsSchema.safeParse({
    kolegijId,
    zadatakId,
  });

  if (!idsValidni.success) {
    notFound();
  }

  // Dohvaćanje zadatka i povijesti predaja.
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

  // Jezik i prijevodi.
  const t = await getTranslations("studentAssignments");
  const locale = await getLocale();
  const jezik = locale === "en" ? "en" : "hr";

  // Servis već vraća verzije sortirane uzlazno po broju.
  // Uzimamo posljednju verziju koja ima valjan broj.
  const zadnjaVerzija =
    [...povijest]
      .reverse()
      .find((verzija) => verzija.broj !== null) ??
    povijest[povijest.length - 1];

  // Trenutačni status predaje.
  const status: StatusPredaje =
    zadatak.status ?? "nije_predano";

  // Rok koji vrijedi za sljedeću predaju.
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

  // Provjera može li student predati zadatak.
  const mozePredati =
    mozeStudentPredati(status) &&
    (zadatak.dopusti_kasnu_predaju || !rokProsao);

  // Određivanje vrste predaje.
  const vrstaPredaje =
    status === "nije_predano"
      ? "prva"
      : status === "predano"
        ? "zamjena"
        : "dorada";

  // Prijevod dopuštenih načina predaje.
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
      {/* Naslov stranice */}
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
            <Oznaka ton={TON_STATUSA[status]}>
              {t(KLJUC_STATUSA[status])}
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
                  {formatDatumVrijeme(
                    rokZaPredaju,
                    jezik,
                  )}
                </dd>
              </div>
            )}

            <div>
              <dt className="font-medium">
                {t("maxPoints")}
              </dt>

              <dd className="mt-1">
                {formatBroj(zadatak.max_bodova, jezik)}
              </dd>
            </div>

            {zadatak.bodovi !== null && (
              <div>
                <dt className="font-medium">
                  {t("points")}
                </dt>

                <dd className="mt-1">
                  {formatBroj(zadatak.bodovi, jezik)}
                  {" / "}
                  {formatBroj(zadatak.max_bodova, jezik)}
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
            <p className="text-sm text-upozorenje">
              {t("deadlinePassed")}
            </p>
          )}
        </div>
      </Kartica>

      {/* Materijali priloženi zadatku */}
      <Kartica naslov={t("taskFiles")}>
        {zadatak.prilozi.length === 0 ? (
          <p className="text-sm text-tekst-slab">
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

                  <p className="text-xs text-tekst-slab">
                    {formatVelicina(
                      prilog.velicina,
                      jezik,
                    )}
                  </p>
                </div>

                <a
                  href={`/api/datoteke/${prilog.id}?locale=${encodeURIComponent(locale)}`}
                  className="text-sm text-naglasak hover:underline"
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
          key={`${zadatak.trenutna_verzija}-${zadnjaVerzija?.predano_at?.getTime() ?? "bez-datuma"}`}
          zadatakId={zadatakId}
          locale={locale}
          naciniPredaje={zadatak.nacini_predaje}
          vrsta={vrstaPredaje}
          pocetniTekst={
            status === "predano"
              ? zadnjaVerzija?.tekst ?? null
              : null
          }
          pocetnaPoveznica={
            status === "predano"
              ? zadnjaVerzija?.link ?? null
              : null
          }
        />
      )}

      {/* Status predaje */}
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
            <p className="text-sm text-upozorenje">
              {t("submissionClosed")}
            </p>
          </Kartica>
        )}

      {/* Povijest predaja */}
      <Kartica naslov={t("historyTitle")}>
        {povijest.length === 0 ? (
          <p className="text-sm text-tekst-slab">
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
                  className="space-y-3 border-b border-rub pb-5 last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">
                      {t("version")} {verzija.broj ?? "—"}
                    </h3>

                    <span className="text-sm text-tekst-slab">
                      {verzija.predano_at
                        ? formatDatumVrijeme(
                            verzija.predano_at,
                            jezik,
                          )
                        : "—"}
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
                        className="mt-1 block break-all text-sm text-naglasak hover:underline"
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
                              className="text-sm text-naglasak hover:underline"
                            >
                              {datoteka.naziv}
                            </a>

                            <span className="ml-2 text-xs text-tekst-slab">
                              {formatVelicina(
                                datoteka.velicina,
                                jezik,
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {odluka && (
                    <div className="space-y-2 rounded-lg border border-rub bg-pozadina p-4">
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
                          {t("points")}:{" "}
                          {formatBroj(
                            verzija.bodovi,
                            jezik,
                          )}
                        </p>
                      )}

                      {verzija.rok_dorade && (
                        <p className="text-sm text-upozorenje">
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