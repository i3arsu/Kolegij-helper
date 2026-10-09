import { Oznaka, Tablica } from "@/components/ui";
import { upit } from "@/lib/auth/guard";
import { NAZIV_STATUSA } from "@/lib/domena/dolaznost";
import { formatDatumDan, formatVrijeme } from "@/lib/domena/vrijeme";
import { dolasciStudenta } from "@/lib/servisi/termini";

export default async function MojaDolaznost({ params }: PageProps<"/moj/[kolegijId]/dolaznost">) {
  const { kolegijId } = await params;
  const dolasci = await upit((tx, profil) => dolasciStudenta(tx, kolegijId, profil.student!.id));
  const prosli = dolasci.filter((d) => d.prosao);
  return (
    <Tablica>
      <thead><tr><th>Termin</th><th>Grupa</th><th>Tema</th><th>Status</th></tr></thead>
      <tbody>
        {prosli.reverse().map((d) => (
          <tr key={d.termin_id} className={d.otkazan ? "text-tekst-slab" : undefined}>
            <td>{formatDatumDan(d.pocetak)} {formatVrijeme(d.pocetak)}</td>
            <td>{d.grupa}</td>
            <td>{d.tema ?? ""}</td>
            <td>
              {d.otkazan ? "otkazan" : !d.evidentirano ? <span className="text-tekst-slab">još nije evidentirano</span> : (
                <Oznaka ton={d.status === "prisutan" ? "uspjeh" : d.status === "opravdano" ? "upozorenje" : "greska"}>{NAZIV_STATUSA[d.status ?? "odsutan"]}</Oznaka>
              )}
            </td>
          </tr>
        ))}
        {prosli.length === 0 && <tr><td colSpan={4} className="text-tekst-slab">Još nema održanih termina.</td></tr>}
      </tbody>
    </Tablica>
  );
}
