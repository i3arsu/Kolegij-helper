
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  GumbLink,
  Kartica,
  Naslov,
  Oznaka,
} from "@/components/ui";

import { upit, zahtijevajOsoblje } from "@/lib/auth/guard";

import { formatBroj } from "@/lib/domena/broj";
import { formatVelicina } from "@/lib/domena/datoteke";
import {
  KLJUC_STATUSA,
  TON_STATUSA,
} from "@/lib/domena/statusi";
import { formatDatumVrijeme } from "@/lib/domena/vrijeme";

import {
  predlosciKomentara,
} from "@/lib/servisi/kolegij";

import {
  pregledPredaje,
  sljedecaPredajaZaPregled,
} from "@/lib/servisi/pregled-predaje";

import { AkcijePregleda } from "./akcije-komponenta";
import { FormaOcjene } from "./forma-ocjene";

const idsSchema = z.object({
  kolegijId: z.uuid(),
  zadatakId: z.uuid(),
  predajaId: z.uuid(),
});

export default async function PregledPredaje({
  params,
}: PageProps<
  "/[locale]/nastava/[kolegijId]/zadaci/[zadatakId]/predaje/[predajaId]"
>) {
  // 1. Parametri rute.
  const {
    kolegijId,
    zadatakId,
    predajaId,
  } = await params;

  // 2. Validacija identifikatora.
  const idsValidni = idsSchema.safeParse({
    kolegijId,
    zadatakId,
    predajaId,
  });

  if (!idsValidni.success) {
    notFound();
  }

  // 3. Provjera ovlasti osoblja.
  const uloga = await zahtijevajOsoblje(kolegijId);

  // 4. Dohvaćanje podataka predaje.
  const rezultat = await upit(async (tx, profil) => {
    const detalji = await pregledPredaje(
      tx,
      kolegijId,
      zadatakId,
      predajaId,
    );

    if (!detalji) {
      return {
        detalji: null,
        jeMojPregled: false,
        predlosci: [],
        sljedecaPredajaId: null,
      };
    }

    // Je li trenutačni korisnik preuzeo pregled?
    const jeMojPregled =
      detalji.status === "u_pregledu" &&
      detalji.pregledava === profil.korisnikId;

    // Predloške komentara dohvaćamo samo vlasniku pregleda.
    const predlosci = jeMojPregled
      ? await predlosciKomentara(tx, kolegijId)
      : [];

    // Pronalazimo sljedeću dostupnu predaju.
    const sljedecaPredajaId =
      await sljedecaPredajaZaPregled(
        tx,
        kolegijId,
        zadatakId,
        predajaId,
      );

    return {
      detalji,
      jeMojPregled,
      predlosci,
      sljedecaPredajaId,
    };
  });

  const {
    detalji,
    jeMojPregled,
    predlosci,
    sljedecaPredajaId,
  } = rezultat;

  if (!detalji) {
    notFound();
  }

  // 5. Jezik i prijevodi.
  const locale = await getLocale();
  const jezik = locale === "en" ? "en" : "hr";

  const t = await getTranslations(
    "teacherSubmissionReview",
  );

  const tStatus = await getTranslations(
    "teacherAssignmentSubmissions",
  );

  // 6. Najnovija verzija nalazi se na početku niza.
  const zadnjaVerzija = detalji.verzije[0];

  return (
    <div className="space-y-4">
      {/* Naslov stranice */}
      <Naslov
        podnaslov={t("subtitle")}
        akcije={
          <GumbLink
            href={`/nastava/${kolegijId}/zadaci/${zadatakId}`}
          >
            {t("backToAssignment")}
          </GumbLink>
        }
      >
        {t("title")}
      </Naslov>

      {/* Sljedeća dostupna predaja */}
      {sljedecaPredajaId && (
        <div className="flex justify-end">
          <GumbLink
            href={`/nastava/${kolegijId}/zadaci/${zadatakId}/predaje/${sljedecaPredajaId}`}
          >
            {t("nextSubmission")}
          </GumbLink>
        </div>
      )}

      {/* Osnovni podaci o studentu */}
      <Kartica naslov={t("student")}>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">
              {t("fullName")}
            </dt>

            <dd className="mt-1">
              {detalji.prezime} {detalji.ime}
            </dd>
          </div>

          <div>
            <dt className="font-medium">
              {t("jmbag")}
            </dt>

            <dd className="mt-1 tabular-nums">
              {detalji.jmbag}
            </dd>
          </div>
        </dl>
      </Kartica>

      {/* Podaci o zadatku i trenutačnoj predaji */}
      <Kartica naslov={t("assignment")}>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold">
              {detalji.naslov}
            </h3>

            <p className="mt-2 whitespace-pre-wrap text-sm text-tekst-slab">
              {detalji.opis || "—"}
            </p>
          </div>

          <div className="border-t border-rub pt-4">
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="font-medium">
                  {t("status")}
                </dt>

                <dd className="mt-2">
                  <Oznaka ton={TON_STATUSA[detalji.status]}>
                    {tStatus(KLJUC_STATUSA[detalji.status])}
                  </Oznaka>
                </dd>
              </div>

              <div>
                <dt className="font-medium">
                  {t("points")}
                </dt>

                <dd className="mt-1 tabular-nums">
                  {detalji.bodovi === null
                    ? "—"
                    : formatBroj(detalji.bodovi, jezik)}
                  {" / "}
                  {formatBroj(detalji.max_bodova, jezik)}
                </dd>
              </div>

              <div>
                <dt className="font-medium">
                  {t("currentVersion")}
                </dt>

                <dd className="mt-1">
                  {detalji.trenutna_verzija}
                </dd>
              </div>

              <div>
                <dt className="font-medium">
                  {t("submittedAt")}
                </dt>

                <dd className="mt-1">
                  {detalji.predano_at
                    ? formatDatumVrijeme(
                        detalji.predano_at,
                        jezik,
                      )
                    : "—"}
                </dd>
              </div>

              <div>
                <dt className="font-medium">
                  {t("originalDeadline")}
                </dt>

                <dd className="mt-1">
                  {formatDatumVrijeme(
                    detalji.izvorni_rok,
                    jezik,
                  )}
                </dd>
              </div>

              <div>
                <dt className="font-medium">
                  {t("effectiveDeadline")}
                </dt>

                <dd className="mt-1">
                  {detalji.rok
                    ? formatDatumVrijeme(
                        detalji.rok,
                        jezik,
                      )
                    : "—"}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              {detalji.kasni && (
                <Oznaka ton="upozorenje">
                  {t("late")}
                </Oznaka>
              )}

              {detalji.ima_produljenje && (
                <Oznaka ton="neutralno">
                  {t("extended")}
                </Oznaka>
              )}
            </div>
          </div>
        </div>
      </Kartica>

      {/* Preuzimanje i otpuštanje pregleda */}
      <Kartica naslov={t("reviewActions")}>
        <AkcijePregleda
          kolegijId={kolegijId}
          zadatakId={zadatakId}
          predajaId={predajaId}
          status={detalji.status}
          jeMojPregled={jeMojPregled}
          jeNastavnik={uloga === "nastavnik"}
          pregledavaIme={detalji.pregledava_ime}
          pregledavaPrezime={detalji.pregledava_prezime}
        />
      </Kartica>

      {/* Obrazac za ocjenjivanje */}
      {jeMojPregled && (
        <Kartica naslov={t("grading")}>
          <FormaOcjene
            kolegijId={kolegijId}
            zadatakId={zadatakId}
            predajaId={predajaId}
            maxBodova={detalji.max_bodova}
            pocetniKomentar={
              zadnjaVerzija?.komentar ?? ""
            }
            pocetniBodovi={
              zadnjaVerzija?.bodovi ?? null
            }
            predlosci={predlosci.map(
              ({ id, naslov, tekst }) => ({
                id,
                naslov,
                tekst,
              }),
            )}
          />
        </Kartica>
      )}

      {/* Povijest svih verzija */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {t("history")}
          </h2>

          <span className="text-sm text-tekst-slab">
            {detalji.verzije.length}
          </span>
        </div>

        {detalji.verzije.length === 0 ? (
          <Kartica>
            <p className="text-sm text-tekst-slab">
              {t("emptyHistory")}
            </p>
          </Kartica>
        ) : (
          detalji.verzije.map((verzija) => {
            const imaPovratnuInformaciju =
              verzija.odluka !== null ||
              verzija.komentar !== null ||
              verzija.bodovi !== null ||
              verzija.rok_dorade !== null;

            return (
              <Kartica
                key={verzija.verzija_id}
                naslov={`${t("version")} ${verzija.broj}`}
              >
                <div className="space-y-5">
                  {/* Podaci o verziji */}
                  <dl className="grid gap-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="font-medium">
                        {t("submitted")}
                      </dt>

                      <dd className="mt-1">
                        {formatDatumVrijeme(
                          verzija.predano_at,
                          jezik,
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="font-medium">
                        {t("versionDeadline")}
                      </dt>

                      <dd className="mt-1">
                        {verzija.rok_verzije
                          ? formatDatumVrijeme(
                              verzija.rok_verzije,
                              jezik,
                            )
                          : "—"}
                      </dd>
                    </div>
                  </dl>

                  {verzija.kasni && (
                    <div>
                      <Oznaka ton="upozorenje">
                        {t("late")}
                      </Oznaka>
                    </div>
                  )}

                  {/* Tekst predaje */}
                  <div>
                    <h3 className="text-sm font-semibold">
                      {t("submissionText")}
                    </h3>

                    <p className="mt-2 whitespace-pre-wrap text-sm">
                      {verzija.tekst || t("noText")}
                    </p>
                  </div>

                  {/* Vanjska poveznica */}
                  {verzija.link && (
                    <div>
                      <h3 className="text-sm font-semibold">
                        {t("externalLink")}
                      </h3>

                      <a
                        href={verzija.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 block break-all text-sm text-naglasak hover:underline"
                      >
                        {t("openLink")}
                      </a>
                    </div>
                  )}

                  {/* Datoteke verzije */}
                  <div>
                    <h3 className="text-sm font-semibold">
                      {t("files")}
                    </h3>

                    {verzija.datoteke.length === 0 ? (
                      <p className="mt-2 text-sm text-tekst-slab">
                        {t("noFiles")}
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {verzija.datoteke.map((datoteka) => (
                          <li
                            key={datoteka.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-rub p-3"
                          >
                            <div className="min-w-0">
                              <p className="break-all text-sm font-medium">
                                {datoteka.naziv}
                              </p>

                              <p className="mt-1 text-xs text-tekst-slab">
                                {formatVelicina(
                                  datoteka.velicina,
                                  jezik,
                                )}
                                {" · "}
                                {datoteka.mime}
                              </p>
                            </div>

                            <a
                              href={`/api/datoteke/${datoteka.id}?locale=${encodeURIComponent(locale)}`}
                              className="shrink-0 text-sm font-medium text-naglasak hover:underline"
                            >
                              {t("download")}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Povratna informacija nastavnika */}
                  <div className="border-t border-rub pt-4">
                    <h3 className="text-sm font-semibold">
                      {t("feedback")}
                    </h3>

                    {imaPovratnuInformaciju ? (
                      <div className="mt-3 space-y-3">
                        {verzija.odluka && (
                          <div>
                            <dt className="text-xs font-medium text-tekst-slab">
                              {t("decision")}
                            </dt>

                            <dd className="mt-1">
                              <Oznaka
                                ton={
                                  verzija.odluka === "prihvaceno"
                                    ? "uspjeh"
                                    : "upozorenje"
                                }
                              >
                                {verzija.odluka === "prihvaceno"
                                  ? t("accepted")
                                  : t("returned")}
                              </Oznaka>
                            </dd>
                          </div>
                        )}

                        {verzija.komentar && (
                          <p className="whitespace-pre-wrap text-sm">
                            {verzija.komentar}
                          </p>
                        )}

                        {verzija.bodovi !== null && (
                          <p className="text-sm">
                            <span className="font-medium">
                              {t("points")}:
                            </span>
                            {" "}
                            {formatBroj(
                              verzija.bodovi,
                              jezik,
                            )}
                          </p>
                        )}

                        {verzija.rok_dorade && (
                          <p className="text-sm">
                            <span className="font-medium">
                              {t("revisionDeadline")}:
                            </span>
                            {" "}
                            {formatDatumVrijeme(
                              verzija.rok_dorade,
                              jezik,
                            )}

                            {verzija.rok_dorade_prosao && (
                              <span className="ml-2">
                                <Oznaka ton="upozorenje">
                                  {t("deadlinePassed")}
                                </Oznaka>
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-tekst-slab">
                        {t("noFeedback")}
                      </p>
                    )}
                  </div>
                </div>
              </Kartica>
            );
          })
        )}
      </section>
    </div>
  );
}