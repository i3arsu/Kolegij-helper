
import { getTranslations } from "next-intl/server";
import { Kartica, TrakaPostotka } from "@/components/ui";
import { upit } from "@/lib/auth/guard";
import { formatDatumDan, formatVrijeme } from "@/lib/domena/vrijeme";
import { mojPregled } from "@/lib/servisi/student";

export default async function MojPregled({
  params,
}: PageProps<"/[locale]/moj/[kolegijId]">) {
  const { kolegijId, locale } = await params;
  const t = await getTranslations("studentCourse");

  const p = await upit((tx, profil) =>
    mojPregled(tx, kolegijId, profil.student!.id)
  );

  const pravilo = (tip: string) =>
    p.pravila
      ? Number(
          tip === "predavanje"
            ? p.pravila.min_dolaznost_predavanja
            : p.pravila.min_dolaznost_vjezbi
        )
      : null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
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

      <Kartica naslov={t("upcomingTitle")}>
        {p.sljedeci.length === 0 ? (
          <p className="text-sm text-tekst-slab">
            {t("noScheduledSessions")}
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {p.sljedeci.map((termin) => (
              <li key={termin.id}>
                {formatDatumDan(termin.pocetak,locale === "en" ? "en" : "hr")}{" "}
                {formatVrijeme(termin.pocetak)}–{formatVrijeme(termin.kraj)}
                {" · "}
                {termin.grupa}
                {termin.tema ? ` · ${termin.tema}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Kartica>
    </div>
  );
}