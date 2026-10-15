import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Gumb, Kartica, Poruka } from "@/components/ui";
import { upit } from "@/lib/auth/guard";
import { formatDatumDan, formatDatumVrijeme, formatVrijeme } from "@/lib/domena/vrijeme";
import { evidencijaTermina } from "@/lib/servisi/termini";
import { obrisiAkcija, otkaziAkcija } from "../akcije";
import { Evidencija } from "./evidencija";

export default async function Termin({ params }: PageProps<"/[locale]/nastava/[kolegijId]/termini/[terminId]">) {
  const { kolegijId, terminId, locale } = await params;
  const jezik = locale === "en" ? "en" : "hr";
  if (!/^[0-9a-f-]{36}$/i.test(terminId)) notFound();
  const podaci = await upit((tx) => evidencijaTermina(tx, terminId));
  if (!podaci || podaci.termin.kolegij_id !== kolegijId) notFound();
  const { termin, studenti } = podaci;
  const t = await getTranslations("teacherSessions");
  const obrisi = async () => {
    "use server";
    await obrisiAkcija(kolegijId, terminId, jezik);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Kartica naslov={`${formatDatumDan(termin.pocetak, jezik)} ${formatVrijeme(termin.pocetak)}–${formatVrijeme(termin.kraj)} · ${termin.grupa}`}>
          {termin.otkazan ? (
            <Poruka vrsta="upozorenje">{t("cancelledNotice")}</Poruka>
          ) : (
            <>
              {termin.buduci && <div className="mb-3"><Poruka vrsta="info">{t("notStarted")}</Poruka></div>}
              <Evidencija kolegijId={kolegijId} terminId={terminId} studenti={studenti} spremljena={Boolean(termin.evidencija_spremljena_at)} />
            </>
          )}
        </Kartica>
      </div>
      <Kartica naslov={t("details")}>
        <dl className="space-y-2 text-sm">
          <div><dt className="text-tekst-slab">{t("type")}</dt><dd>{t(`types.${termin.tip}`)}</dd></div>
          <div><dt className="text-tekst-slab">{t("topic")}</dt><dd>{termin.tema ?? "—"}</dd></div>
          <div><dt className="text-tekst-slab">{t("attendance")}</dt><dd>{termin.evidencija_spremljena_at ? t("savedAt", { when: formatDatumVrijeme(termin.evidencija_spremljena_at, jezik) }) : t("notSaved")}</dd></div>
        </dl>
        <div className="mt-4 flex flex-col gap-2 border-t border-rub pt-4">
          <form action={otkaziAkcija.bind(null, kolegijId, terminId, !termin.otkazan)}>
            <Gumb varijanta="sekundarni" className="w-full">{termin.otkazan ? t("restore") : t("cancel")}</Gumb>
          </form>
          {!termin.evidencija_spremljena_at && (
            <form action={obrisi}>
              <Gumb varijanta="opasni" className="w-full">{t("delete")}</Gumb>
            </form>
          )}
        </div>
      </Kartica>
    </div>
  );
}
