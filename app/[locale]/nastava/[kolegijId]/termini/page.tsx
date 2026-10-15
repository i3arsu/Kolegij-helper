import Link from "next/link";
import { GumbLink, Odabir, Oznaka, Tablica } from "@/components/ui";
import { upit } from "@/lib/auth/guard";
import { formatDatumDan, formatVrijeme } from "@/lib/domena/vrijeme";
import { terminiKolegija } from "@/lib/servisi/termini";

export default async function Termini({ params, searchParams }: PageProps<"/[locale]/nastava/[kolegijId]/termini">) {
  const { kolegijId } = await params;
  const sp = await searchParams;
  const grupa = typeof sp.grupa === "string" ? sp.grupa : "";
  const termini = await upit((tx) => terminiKolegija(tx, kolegijId));
  const grupe = [...new Set(termini.map((t) => t.grupa))].sort();
  const prikaz = termini.filter((t) => !grupa || t.grupa === grupa);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <form className="flex items-end gap-2">
          <Odabir oznaka="Grupa" name="grupa" defaultValue={grupa}>
            <option value="">Sve</option>
            {grupe.map((g) => <option key={g}>{g}</option>)}
          </Odabir>
          <button className="rounded-md border border-rub bg-povrsina px-3 py-2 text-sm">Prikaži</button>
        </form>
        <GumbLink href={`/nastava/${kolegijId}/termini/novi`}>Novi termin</GumbLink>
      </div>
      <Tablica>
        <thead><tr><th>Datum</th><th>Vrijeme</th><th>Grupa</th><th>Tema</th><th>Evidencija</th></tr></thead>
        <tbody>
          {prikaz.map((t) => {
            return (
              <tr key={t.id} className={t.otkazan ? "text-tekst-slab" : undefined}>
                <td><Link className="hover:underline" href={`/nastava/${kolegijId}/termini/${t.id}`}>{formatDatumDan(t.pocetak)}</Link></td>
                <td className="tabular-nums">{formatVrijeme(t.pocetak)}–{formatVrijeme(t.kraj)}</td>
                <td>{t.grupa}</td>
                <td>{t.tema ?? ""}</td>
                <td>
                  {t.otkazan ? <Oznaka>otkazan</Oznaka>
                    : t.evidencija_spremljena_at ? <Oznaka ton="uspjeh">spremljena</Oznaka>
                    : t.prosao ? <Oznaka ton="upozorenje">nedostaje</Oznaka>
                    : <span className="text-tekst-slab">—</span>}
                </td>
              </tr>
            );
          })}
          {prikaz.length === 0 && <tr><td colSpan={5} className="text-tekst-slab">Nema termina.</td></tr>}
        </tbody>
      </Tablica>
    </>
  );
}
