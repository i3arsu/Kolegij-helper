
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

import {
  Gumb,
  GumbLink,
  Kartica,
  Oznaka,
  Odabir,
  Poruka,
  Tablica,
} from "@/components/ui";

import type { StatusPredaje } from "@/lib/db/tipovi";
import type { RedPredajeZadatka } from "@/lib/servisi/predaje-zadatka";
import { formatDatumVrijeme } from "@/lib/domena/vrijeme";

type Parametri = {
  status?: string | string[];
  grupa?: string | string[];
};

const STATUSI: StatusPredaje[] = [
  "nije_predano",
  "predano",
  "u_pregledu",
  "vraceno_na_doradu",
  "prihvaceno",
];

function jednaVrijednost(
  vrijednost: string | string[] | undefined,
): string {
  return typeof vrijednost === "string" ? vrijednost : "";
}

export async function PredajeZadatkaTablica({
  kolegijId,
  zadatakId,
  objavljen,
  predaje,
  searchParams,
  jezik,
}: {
  kolegijId: string;
  zadatakId: string;
  objavljen: boolean;
  predaje: RedPredajeZadatka[];
  searchParams: Parametri;
  jezik: "hr" | "en";
}) {
  const t = await getTranslations("teacherAssignmentSubmissions");

  // Nacrt zadatka ne treba prikazivati popis predaja.
  if (!objavljen) {
    return (
      <Kartica naslov={t("title")}>
        <Poruka>{t("notPublished")}</Poruka>
      </Kartica>
    );
  }

  function nazivStatusa(status: StatusPredaje): string {
    switch (status) {
      case "nije_predano":
        return t("statuses.nije_predano");
      case "predano":
        return t("statuses.predano");
      case "u_pregledu":
        return t("statuses.u_pregledu");
      case "vraceno_na_doradu":
        return t("statuses.vraceno_na_doradu");
      case "prihvaceno":
        return t("statuses.prihvaceno");
    }
  }

  function tonStatusa(
    status: StatusPredaje,
  ): "uspjeh" | "upozorenje" | "neutralno" {
    switch (status) {
      case "prihvaceno":
        return "uspjeh";
      case "u_pregledu":
      case "vraceno_na_doradu":
        return "upozorenje";
      default:
        return "neutralno";
    }
  }

  function prikaziBodove(bodovi: string | null): string {
    if (bodovi === null) {
      return "—";
    }

    const vrijednost = Number(bodovi);

    if (!Number.isFinite(vrijednost)) {
      return bodovi;
    }

    return new Intl.NumberFormat(jezik, {
      maximumFractionDigits: 2,
    }).format(vrijednost);
  }

  const statusParam = jednaVrijednost(searchParams.status);

  const status: StatusPredaje | "" = STATUSI.includes(
    statusParam as StatusPredaje,
  )
    ? (statusParam as StatusPredaje)
    : "";

  const grupe = Array.from(
    new Map(
      predaje
        .flatMap((predaja) => predaja.grupe)
        .map((stavka) => [stavka.id, stavka]),
    ).values(),
  ).sort((a, b) => a.naziv.localeCompare(b.naziv, jezik));

  const grupaParam = jednaVrijednost(searchParams.grupa);

  const grupa = grupe.some((stavka) => stavka.id === grupaParam)
    ? grupaParam
    : "";

  const filtrirane = predaje.filter((predaja) => {
    if (status && predaja.status !== status) {
      return false;
    }

    if (
      grupa &&
      !predaja.grupe.some((stavka) => stavka.id === grupa)
    ) {
      return false;
    }

    return true;
  });

  return (
    <Kartica naslov={t("title")}>
      <div className="space-y-4">
        <form
          method="get"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end"
        >
          <Odabir
            oznaka={t("statusFilter")}
            name="status"
            defaultValue={status}
          >
            <option value="">{t("allStatuses")}</option>

            {STATUSI.map((vrijednost) => (
              <option key={vrijednost} value={vrijednost}>
                {nazivStatusa(vrijednost)}
              </option>
            ))}
          </Odabir>

          <Odabir
            oznaka={t("groupFilter")}
            name="grupa"
            defaultValue={grupa}
          >
            <option value="">{t("allGroups")}</option>

            {grupe.map((stavka) => (
              <option key={stavka.id} value={stavka.id}>
                {stavka.naziv}
              </option>
            ))}
          </Odabir>

          <Gumb type="submit">{t("filter")}</Gumb>

          <GumbLink href={`/nastava/${kolegijId}/zadaci/${zadatakId}`}>
            {t("reset")}
          </GumbLink>
        </form>

        <p className="text-sm text-tekst-slab">
          {t("resultsCount", {
            filtered: filtrirane.length,
            total: predaje.length,
          })}
        </p>

        {filtrirane.length === 0 ? (
          <Poruka>{t("empty")}</Poruka>
        ) : (
          <Tablica>
            <thead>
              <tr>
                <th>{t("student")}</th>
                <th>{t("jmbag")}</th>
                <th>{t("group")}</th>
                <th>{t("status")}</th>
                <th>{t("submittedAt")}</th>
                <th>{t("deadlineStatus")}</th>
                <th>{t("points")}</th>
              </tr>
            </thead>

            <tbody>
              {filtrirane.map((predaja) => (
                <tr key={predaja.student_id}>
                  <td>
                    <Link
                      className="font-medium hover:underline"
                      href={`/nastava/${kolegijId}/studenti/${predaja.student_id}`}
                    >
                      {predaja.prezime} {predaja.ime}
                    </Link>
                  </td>

                  <td className="tabular-nums">
                    {predaja.jmbag}
                  </td>

                  <td>
                    {predaja.grupe.length > 0 ? (
                      predaja.grupe
                        .map((stavka) => stavka.naziv)
                        .join(", ")
                    ) : (
                      <span className="text-tekst-slab">—</span>
                    )}
                  </td>

                  <td>
                    <Oznaka ton={tonStatusa(predaja.status)}>
                      {nazivStatusa(predaja.status)}
                    </Oznaka>
                  </td>

                  <td className="text-tekst-slab">
                    {predaja.predano_at
                      ? formatDatumVrijeme(predaja.predano_at, jezik)
                      : "—"}
                  </td>

                  <td>
                    <div className="flex flex-col items-start gap-1">
                      <span className="tabular-nums">
                        {formatDatumVrijeme(predaja.rok, jezik)}
                      </span>

                      {predaja.kasni ? (
                        <Oznaka ton="upozorenje">
                          {t("late")}
                        </Oznaka>
                      ) : predaja.rok_prosao ? (
                        <Oznaka ton="upozorenje">
                          {t("deadlinePassed")}
                        </Oznaka>
                      ) : (
                        <span className="text-tekst-slab">—</span>
                      )}
                    </div>
                  </td>

                  <td className="tabular-nums">
                    {prikaziBodove(predaja.bodovi)}
                  </td>
                </tr>
              ))}

              {filtrirane.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-tekst-slab">
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </Tablica>
        )}
      </div>
    </Kartica>
  );
}