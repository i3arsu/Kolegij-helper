import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { GumbLink, Odabir, Oznaka, Tablica } from "@/components/ui";
import { upit } from "@/lib/auth/guard";
import { formatDatumDan, formatVrijeme } from "@/lib/domena/vrijeme";
import { terminiKolegija } from "@/lib/servisi/termini";

export default async function Termini({ params, searchParams }: PageProps<"/[locale]/nastava/[kolegijId]/termini">) {
  const { kolegijId, locale } = await params;
  const jezik = locale === "en" ? "en" : "hr";
  const t = await getTranslations("teacherSessions");
  const sp = await searchParams;
  const grupa = typeof sp.grupa === "string" ? sp.grupa : "";
  const termini = await upit((tx) => terminiKolegija(tx, kolegijId));
  const grupe = [...new Set(termini.map((x) => x.grupa))].sort();
  const prikaz = termini.filter((x) => !grupa || x.grupa === grupa);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <form className="flex items-end gap-2">
          <Odabir oznaka={t("group")} name="grupa" defaultValue={grupa}>
            <option value="">{t("allGroups")}</option>
            {grupe.map((g) => <option key={g}>{g}</option>)}
          </Odabir>
          <button className="rounded-md border border-rub bg-povrsina px-3 py-2 text-sm">{t("show")}</button>
        </form>
        <GumbLink href={`/nastava/${kolegijId}/termini/novi`}>{t("newSession")}</GumbLink>
      </div>
      <Tablica>
        <thead><tr><th>{t("date")}</th><th>{t("time")}</th><th>{t("group")}</th><th>{t("topic")}</th><th>{t("attendance")}</th></tr></thead>
        <tbody>
          {prikaz.map((x) => (
            <tr key={x.id} className={x.otkazan ? "text-tekst-slab" : undefined}>
              <td><Link className="hover:underline" href={`/nastava/${kolegijId}/termini/${x.id}`}>{formatDatumDan(x.pocetak, jezik)}</Link></td>
              <td className="tabular-nums">{formatVrijeme(x.pocetak)}–{formatVrijeme(x.kraj)}</td>
              <td>{x.grupa}</td>
              <td>{x.tema ?? ""}</td>
              <td>
                {x.otkazan ? <Oznaka>{t("cancelled")}</Oznaka>
                  : x.evidencija_spremljena_at ? <Oznaka ton="uspjeh">{t("saved")}</Oznaka>
                  : x.prosao ? <Oznaka ton="upozorenje">{t("missing")}</Oznaka>
                  : <span className="text-tekst-slab">—</span>}
              </td>
            </tr>
          ))}
          {prikaz.length === 0 && <tr><td colSpan={5} className="text-tekst-slab">{t("empty")}</td></tr>}
        </tbody>
      </Tablica>
    </>
  );
}
