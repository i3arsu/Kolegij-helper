import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Kartica } from "@/components/ui";
import { upit } from "@/lib/auth/guard";
import {
  formatDatumDan,
  formatVrijeme,
} from "@/lib/domena/vrijeme";
import { sazetakKolegija } from "@/lib/servisi/sazetak";

export default async function Sazetak({
  params,
}: PageProps<"/[locale]/nastava/[kolegijId]">) {
  const { kolegijId, locale } = await params;

  const tekst = await getTranslations("teacherCourse");
  const s = await upit((tx) =>
    sazetakKolegija(tx, kolegijId),
  );

  const osnova = `/nastava/${kolegijId}`;

  const localeBrojeva =
    locale === "en" ? "en-GB" : "hr-HR";

  const jezikDatuma =
    locale === "en" ? "en" : "hr";

  const brojka = (v: number | null) =>
    v === null
      ? "—"
      : `${v.toLocaleString(localeBrojeva)} %`;

  const brojNeevidentiranih =
    `${s.neevidentirani.length}${
      s.neevidentirani.length === 6 ? "+" : ""
    }`;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Kartica naslov={tekst("summaryTitle")}>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-tekst-slab">
              {tekst("students")}
            </dt>
            <dd className="text-2xl font-semibold">
              {s.broj_studenata}
            </dd>
          </div>

          <div />

          <div>
            <dt className="text-tekst-slab">
              {tekst("averageLectureAttendance")}
            </dt>
            <dd className="text-2xl font-semibold">
              {brojka(s.prosjek_p)}
            </dd>
          </div>

          <div>
            <dt className="text-tekst-slab">
              {tekst("averageExerciseAttendance")}
            </dt>
            <dd className="text-2xl font-semibold">
              {brojka(s.prosjek_v)}
            </dd>
          </div>
        </dl>
      </Kartica>

      <Kartica naslov={tekst("warnings")}>
        <ul className="space-y-2 text-sm">
          <li>
            <Link
              className="underline"
              href={`${osnova}/studenti?ispod=1`}
            >
              {s.ispod_p + s.ispod_v === 0
                ? tekst("noStudentsBelowThreshold")
                : tekst("belowThreshold", {
                    lectures: s.ispod_p,
                    exercises: s.ispod_v,
                  })}
            </Link>
          </li>

          {s.neevidentirani.length > 0 && (
            <li>
              {tekst("pastSessionsWithoutRecords", {
                count: brojNeevidentiranih,
              })}
            </li>
          )}
        </ul>
      </Kartica>

      <Kartica naslov={tekst("upcomingSessions")}>
        {s.sljedeci.length === 0 ? (
          <p className="text-sm text-tekst-slab">
            {tekst("noScheduledSessions")}
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {s.sljedeci.map((termin) => (
              <li key={termin.id}>
                <Link
                  className="hover:underline"
                  href={`${osnova}/termini/${termin.id}`}
                >
                  {formatDatumDan(
                    termin.pocetak,
                    jezikDatuma,
                  )}{" "}
                  {formatVrijeme(termin.pocetak)} ·{" "}
                  {termin.grupa}
                  {termin.tema
                    ? ` · ${termin.tema}`
                    : ""}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Kartica>

      <Kartica naslov={tekst("missingAttendance")}>
        {s.neevidentirani.length === 0 ? (
          <p className="text-sm text-tekst-slab">
            {tekst("allPastSessionsRecorded")}
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {s.neevidentirani.map((termin) => (
              <li key={termin.id}>
                <Link
                  className="text-upozorenje hover:underline"
                  href={`${osnova}/termini/${termin.id}`}
                >
                  {formatDatumDan(
                    termin.pocetak,
                    jezikDatuma,
                  )}{" "}
                  {formatVrijeme(termin.pocetak)} ·{" "}
                  {termin.grupa}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Kartica>
    </div>
  );
}