
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  GumbLink,
  Kartica,
  Naslov,
  Oznaka,
  Tablica,
} from "@/components/ui";
import { upit, zahtijevajOsoblje } from "@/lib/auth/guard";
import { zadaciKolegija } from "@/lib/servisi/zadaci";
import { formatDatumVrijeme } from "@/lib/domena/vrijeme";

export default async function Zadaci({
  params,
}: PageProps<"/[locale]/nastava/[kolegijId]/zadaci">) {
  const { kolegijId } = await params;
  const uloga = await zahtijevajOsoblje(kolegijId);

  const zadaci = await upit((tx) =>
    zadaciKolegija(tx, kolegijId),
  );

  const t = await getTranslations("teacherAssignments");
  const locale = await getLocale();
  const jezik = locale === "en" ? "en" : "hr";

  return (
    <div className="space-y-4">
      <Naslov
        podnaslov={t("subtitle")}
        akcije={
          uloga === "nastavnik" ? (
            <GumbLink href={`/nastava/${kolegijId}/zadaci/novi`}>
              {t("newAssignment")}
            </GumbLink>
          ) : undefined
        }
      >
        {t("title")}
      </Naslov>

      {zadaci.length === 0 ? (
        <Kartica>
          <p className="text-sm text-tekst-slab">
            {t("empty")}
          </p>
        </Kartica>
      ) : (
        <Tablica>
          <thead>
            <tr>
              <th>{t("columns.assignment")}</th>
              <th>{t("columns.deadline")}</th>
              <th>{t("columns.audience")}</th>
              <th>{t("columns.status")}</th>
              <th>{t("columns.notSubmitted")}</th>
              <th>{t("columns.submitted")}</th>
              <th>{t("columns.inReview")}</th>
              <th>{t("columns.returned")}</th>
              <th>{t("columns.accepted")}</th>
            </tr>
          </thead>

          <tbody>
            {zadaci.map((z) => (
              <tr key={z.id}>
                <td>
                  <Link
                    href={`/nastava/${kolegijId}/zadaci/${z.id}`}
                    className="font-medium hover:underline"
                  >
                    {z.naslov}
                  </Link>
                </td>

                <td className="whitespace-nowrap">
                  {formatDatumVrijeme(z.rok, jezik)}
                </td>

                <td>
                  {z.za_cijeli_kolegij
                    ? t("wholeCourse")
                    : z.grupe.map((g) => g.naziv).join(", ") || "—"}
                </td>

                <td>
                  {z.objavljen_at === null ? (
                    <Oznaka ton="upozorenje">
                      {t("draft")}
                    </Oznaka>
                  ) : (
                    <Oznaka ton="uspjeh">
                      {t("published")}
                    </Oznaka>
                  )}
                </td>

                <td>{z.nije_predano}</td>
                <td>{z.predano}</td>
                <td>{z.u_pregledu}</td>
                <td>{z.vraceno_na_doradu}</td>
                <td>{z.prihvaceno}</td>
              </tr>
            ))}
          </tbody>
        </Tablica>
      )}
    </div>
  );
}