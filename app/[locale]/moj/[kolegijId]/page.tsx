
import { getTranslations } from "next-intl/server";

import {
  Kartica,
  TrakaPostotka,
  Oznaka,
  GumbLink,
} from "@/components/ui";

import {
  formatDatumDan,
  formatVrijeme,
  formatDatumVrijeme,
} from "@/lib/domena/vrijeme";

import { upit } from "@/lib/auth/guard";
import { mojPregled } from "@/lib/servisi/student";

import {
  sljedeciRokoviStudenta,
  zadnjePovratneInformacije,
} from "@/lib/servisi/zadaci-studenta";

export default async function MojPregled({
  params,
}: PageProps<"/[locale]/moj/[kolegijId]">) {
  const { kolegijId, locale } = await params;

  const t = await getTranslations("studentCourse");
  const td = await getTranslations("studentDashboard");

  // Dohvaćamo sve podatke potrebne za studentski dashboard.
  const { p, rokovi, povratne } = await upit(async (tx, profil) => {
    const pregled = await mojPregled(
      tx,
      kolegijId,
      profil.student!.id,
    );

    const rokovi = await sljedeciRokoviStudenta(
      tx,
      kolegijId,
      profil.student!.id,
    );

    const povratne = await zadnjePovratneInformacije(
      tx,
      kolegijId,
      profil.student!.id,
    );

    return {
      p: pregled,
      rokovi,
      povratne,
    };
  });

  const pravilo = (tip: string) =>
    p.pravila
      ? Number(
          tip === "predavanje"
            ? p.pravila.min_dolaznost_predavanja
            : p.pravila.min_dolaznost_vjezbi
        )
      : null;

  const jezik = locale === "en" ? "en" : "hr";

  return (
    <div className="grid gap-4 md:grid-cols-2">

      {/* 1. Evidencija dolaznosti */}
      <Kartica naslov={t("attendanceTitle")}>
        <div className="space-y-4">
          {(["predavanje", "vjezbe"] as const).map((tip) => {
            const d = p.dolaznost.find((x) => x.tip === tip);
            const grupa = p.grupe.find((g) => g.tip === tip)?.naziv;

            if (!grupa && !d) return null;

            const oznakaTipa =
              tip === "predavanje" ? t("lectures") : t("exercises");

            return (
              <div key={tip}>
                <TrakaPostotka
                  oznaka={`${oznakaTipa}${grupa ? ` (${grupa})` : ""}`}
                  postotak={
                    d?.postotak != null ? Number(d.postotak) : null
                  }
                  prag={pravilo(tip)}
                />

                <p className="mt-1 text-xs text-tekst-slab">
                  {d
                    ? `${t("attendanceSummary", {
                        present: Number(d.prisutan),
                        held: Number(d.odrzano),
                      })}${
                        Number(d.opravdano) > 0
                          ? t("excusedSuffix", {
                              count: Number(d.opravdano),
                            })
                          : ""
                      }.`
                    : t("noRecordedSessions")}
                </p>
              </div>
            );
          })}
        </div>
      </Kartica>

      {/* 2. Sljedeće zakazane nastavne aktivnosti */}
      <Kartica naslov={t("upcomingTitle")}>
        {p.sljedeci.length === 0 ? (
          <p className="text-sm text-tekst-slab">
            {t("noScheduledSessions")}
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {p.sljedeci.map((termin) => (
              <li key={termin.id}>
                {formatDatumDan(termin.pocetak, jezik)}{" "}
                {formatVrijeme(termin.pocetak)}–
                {formatVrijeme(termin.kraj)}
                {" · "}
                {termin.grupa}
                {termin.tema ? ` · ${termin.tema}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Kartica>

      {/* 3. Nadolazeći rokovi zadataka */}
      <Kartica naslov={td("deadlinesTitle")}>
        {rokovi.length === 0 ? (
          <p className="text-sm text-tekst-slab">
            {td("noDeadlines")}
          </p>
        ) : (
          <ul className="space-y-4">
            {rokovi.map((rok) => (
              <li
                key={rok.zadatak_id}
                className="space-y-2 border-b border-rub pb-3 last:border-0 last:pb-0"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {rok.naslov}
                    </p>

                    <p className="mt-1 text-sm text-tekst-slab">
                      {td("deadline")}:{" "}
                      {rok.rok_za_predaju ? formatDatumVrijeme(rok.rok_za_predaju, jezik) : td("noDeadline")}
                    </p>

                    {rok.rok_prosao && (
                      <Oznaka ton="upozorenje">
                        {td("late")}
                      </Oznaka>
                    )}
                  </div>

                  <Oznaka
                    ton={
                      rok.status === "vraceno_na_doradu"
                        ? "upozorenje"
                        : "neutralno"
                    }
                  >
                    {rok.status === "vraceno_na_doradu"
                      ? td("revision")
                      : td("notSubmitted")}
                  </Oznaka>
                </div>

                <GumbLink
                  href={`/moj/${kolegijId}/zadaci/${rok.zadatak_id}`}
                >
                  {td("openAssignment")}
                </GumbLink>
              </li>
            ))}
          </ul>
        )}
      </Kartica>

      {/* 4. Najnovije povratne informacije nastavnika */}
      <Kartica naslov={td("feedbackTitle")}>
        {povratne.length === 0 ? (
          <p className="text-sm text-tekst-slab">
            {td("noFeedback")}
          </p>
        ) : (
          <ul className="space-y-4">
            {povratne.map((povratna, index) => {
              const prihvaceno =
                povratna.odluka === "prihvaceno";

              return (
                <li
                  key={`${povratna.zadatak_id}-${povratna.verzija}-${index}`}
                  className="space-y-2 border-b border-rub pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {povratna.naslov}
                    </p>

                    <Oznaka
                      ton={prihvaceno ? "uspjeh" : "upozorenje"}
                    >
                      {prihvaceno
                        ? td("accepted")
                        : td("returned")}
                    </Oznaka>
                  </div>

                  <p className="text-xs text-tekst-slab">
                    {td("version")} {povratna.verzija}
                    {" · "}
                    {formatDatumVrijeme(
                      povratna.povratna_at,
                      jezik,
                    )}
                  </p>

                  {povratna.komentar && (
                    <p className="whitespace-pre-wrap text-sm">
                      {povratna.komentar}
                    </p>
                  )}

                  {povratna.bodovi !== null && (
                    <p className="text-sm">
                      {td("points")}: {Number(povratna.bodovi)}
                    </p>
                  )}

                  {povratna.rok_dorade && (
                    <p className="text-sm text-upozorenje">
                      {td("revisionDeadline")}:{" "}
                      {formatDatumVrijeme(
                        povratna.rok_dorade,
                        jezik,
                      )}
                    </p>
                  )}

                  <GumbLink
                    href={`/moj/${kolegijId}/zadaci/${povratna.zadatak_id}`}
                  >
                    {td("openAssignment")}
                  </GumbLink>
                </li>
              );
            })}
          </ul>
        )}
      </Kartica>
    </div>
  );
}