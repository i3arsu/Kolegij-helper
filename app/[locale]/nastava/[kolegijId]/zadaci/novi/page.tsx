import { getTranslations } from "next-intl/server";

import { Kartica, Naslov } from "@/components/ui";
import { zahtijevajNastavnika, upit } from "@/lib/auth/guard";
import { isoDatum } from "@/lib/domena/vrijeme";
import { grupeSAsistentima } from "@/lib/servisi/kolegij";

import { FormaZadatka } from "./forma";

export default async function NoviZadatak({
  params,
}: PageProps<"/[locale]/nastava/[kolegijId]/zadaci/novi">) {
  const { kolegijId } = await params;

  await zahtijevajNastavnika(kolegijId);

  const grupe = await upit((tx) =>
    grupeSAsistentima(tx, kolegijId),
  );

  const t = await getTranslations("teacherAssignmentForm");

  return (
    <div className="space-y-4">
      <Naslov podnaslov={t("subtitle")}>
        {t("title")}
      </Naslov>

      <Kartica naslov={t("details")}>
        <FormaZadatka
          kolegijId={kolegijId}
          grupe={grupe.map(({ id, naziv, tip }) => ({
            id,
            naziv,
            tip,
          }))}
          defaultDatum={isoDatum(new Date())}
        />
      </Kartica>
    </div>
  );
}