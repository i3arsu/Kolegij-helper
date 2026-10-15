import { getTranslations } from "next-intl/server";
import { Kartica } from "@/components/ui";
import { upit } from "@/lib/auth/guard";
import { isoDatum } from "@/lib/domena/vrijeme";
import { grupeZaTermine } from "@/lib/servisi/termini";
import { FormaTermina } from "./forma";

export default async function NoviTermin({ params }: PageProps<"/[locale]/nastava/[kolegijId]/termini/novi">) {
  const { kolegijId } = await params;
  const t = await getTranslations("teacherSessions");
  const grupe = await upit((tx) => grupeZaTermine(tx, kolegijId));
  return (
    <Kartica naslov={t("newSession")}>
      <FormaTermina kolegijId={kolegijId} grupe={grupe} danas={isoDatum(new Date())} />
    </Kartica>
  );
}
