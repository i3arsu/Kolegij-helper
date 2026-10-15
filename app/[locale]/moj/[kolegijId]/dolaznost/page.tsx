
import { getTranslations } from "next-intl/server";
import { Oznaka, Tablica } from "@/components/ui";
import { upit } from "@/lib/auth/guard";
import { formatDatumDan, formatVrijeme } from "@/lib/domena/vrijeme";
import { dolasciStudenta } from "@/lib/servisi/termini";

export default async function MojaDolaznost({
  params,
}: PageProps<"/[locale]/moj/[kolegijId]/dolaznost">) {
  const { kolegijId, locale } = await params;

  const t = await getTranslations("studentAttendance");

  const dolasci = await upit((tx, profil) =>
    dolasciStudenta(tx, kolegijId, profil.student!.id)
  );

  const prosli = dolasci.filter((d) => d.prosao).reverse();

  return (
    <Tablica>
      <thead>
        <tr>
          <th>{t("session")}</th>
          <th>{t("group")}</th>
          <th>{t("topic")}</th>
          <th>{t("status")}</th>
        </tr>
      </thead>

      <tbody>
        {prosli.map((d) => {
          const statusKey =
            d.status === "prisutan"
              ? "present"
              : d.status === "opravdano"
                ? "excused"
                : "absent";

          return (
            <tr
              key={d.termin_id}
              className={d.otkazan ? "text-tekst-slab" : undefined}
            >
              <td>
                {formatDatumDan(
                  d.pocetak,
                  locale === "en" ? "en" : "hr"
                )}{" "}
                {formatVrijeme(d.pocetak)}
              </td>

              <td>{d.grupa}</td>

              <td>{d.tema ?? ""}</td>

              <td>
                {d.otkazan ? (
                  t("cancelled")
                ) : !d.evidentirano ? (
                  <span className="text-tekst-slab">
                    {t("notRecorded")}
                  </span>
                ) : (
                  <Oznaka
                    ton={
                      d.status === "prisutan"
                        ? "uspjeh"
                        : d.status === "opravdano"
                          ? "upozorenje"
                          : "greska"
                    }
                  >
                    {t(`statuses.${statusKey}`)}
                  </Oznaka>
                )}
              </td>
            </tr>
          );
        })}

        {prosli.length === 0 && (
          <tr>
            <td colSpan={4} className="text-tekst-slab">
              {t("noPastSessions")}
            </td>
          </tr>
        )}
      </tbody>
    </Tablica>
  );
}