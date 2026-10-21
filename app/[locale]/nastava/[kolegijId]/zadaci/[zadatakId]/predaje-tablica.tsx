
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

import {
  Gumb,
  GumbLink,
  Kartica,
  Oznaka,
  Odabir,
  Poruka,
} from "@/components/ui";

import type { StatusPredaje } from "@/lib/db/tipovi";
import type { RedPredajeZadatka } from "@/lib/servisi/predaje-zadatka";
import { formatDatumVrijeme } from "@/lib/domena/vrijeme";

type Parametros = {
  status?: string | string[];
  grupa?: string | string[];
};

const estados: StatusPredaje[] = [
  "nije_predano",
  "predano",
  "u_pregledu",
  "vraceno_na_doradu",
  "prihvaceno",
];

function valorUnico(valor: string | string[] | undefined): string {
  return typeof valor === "string" ? valor : "";
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
  searchParams: Parametros;
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

  // Čitamo i validiramo filtere iz URL-a.
  const statusParam = valorUnico(searchParams.status);

  const status: StatusPredaje | "" = estados.includes(
    statusParam as StatusPredaje,
  )
    ? (statusParam as StatusPredaje)
    : "";

  // Dostupne grupe iz vidljivih redova.
  const grupe = Array.from(
    new Map(
      predaje
        .flatMap((predaja) => predaja.grupe)
        .map((grupa) => [grupa.id, grupa]),
    ).values(),
  ).sort((a, b) => a.naziv.localeCompare(b.naziv, jezik));

  const grupaParam = valorUnico(searchParams.grupa);

  const grupa = grupe.some((stavka) => stavka.id === grupaParam)
    ? grupaParam
    : "";

  // Primjenjujemo oba filtera.
  const filtrirane = predaje.filter((predaja) => {
    if (status && predaja.status !== status) {
      return false;
    }

    if (
      grupa &&
      !predaja.grupe.some((studentovaGrupa) => studentovaGrupa.id === grupa)
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

            {estados.map((vrijednost) => (
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

        <p className="text-sm text-slate-600">
          {t("resultsCount", {
            shown: filtrirane.length,
            total: predaje.length,
          })}
        </p>

        {filtrirane.length === 0 ? (
          <Poruka>{t("empty")}</Poruka>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("student")}
                  </th>

                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("jmbag")}
                  </th>

                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("group")}
                  </th>

                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("status")}
                  </th>

                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("submittedAt")}
                  </th>

                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("deadlineStatus")}
                  </th>

                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("points")}
                  </th>

                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("submission")}
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtrirane.map((predaja) => (
                  <tr
                    key={predaja.student_id}
                    className="border-b border-slate-100 align-middle last:border-b-0"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/nastava/${kolegijId}/studenti/${predaja.student_id}`}
                        className="font-medium text-blue-700 underline underline-offset-4 hover:text-blue-900"
                      >
                        {predaja.ime} {predaja.prezime}
                      </Link>
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {predaja.jmbag}
                    </td>

                    <td className="px-4 py-3">
                      {predaja.grupe.length > 0
                        ? predaja.grupe.map((stavka) => stavka.naziv).join(", ")
                        : "—"}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      <Oznaka ton={tonStatusa(predaja.status)}>
                        {nazivStatusa(predaja.status)}
                      </Oznaka>
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {predaja.predano_at
                        ? formatDatumVrijeme(predaja.predano_at, jezik)
                        : "—"}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {predaja.kasni ? (
                        <Oznaka ton="upozorenje">{t("late")}</Oznaka>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {prikaziBodove(predaja.bodovi)}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {predaja.predaja_id ? (
                        <Link
                          href={`/nastava/${kolegijId}/zadaci/${zadatakId}/predaje/${predaja.predaja_id}`}
                          className="font-medium text-blue-700 underline underline-offset-4 hover:text-blue-900"
                        >
                          {t("openSubmission")}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Kartica>
  );
}