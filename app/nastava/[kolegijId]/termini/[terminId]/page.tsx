import { notFound } from "next/navigation";
import { Gumb, Kartica, Poruka } from "@/components/ui";
import { upit } from "@/lib/auth/guard";
import { NAZIV_TIPA } from "@/lib/domena/dolaznost";
import { formatDatumDan, formatDatumVrijeme, formatVrijeme } from "@/lib/domena/vrijeme";
import { evidencijaTermina } from "@/lib/servisi/termini";
import { obrisiAkcija, otkaziAkcija } from "../akcije";
import { Evidencija } from "./evidencija";

export default async function Termin({ params }: PageProps<"/nastava/[kolegijId]/termini/[terminId]">) {
  const { kolegijId, terminId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(terminId)) notFound();
  const podaci = await upit((tx) => evidencijaTermina(tx, terminId));
  if (!podaci || podaci.termin.kolegij_id !== kolegijId) notFound();
  const { termin, studenti } = podaci;
  const obrisi = async () => {
    "use server";
    await obrisiAkcija(kolegijId, terminId);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Kartica naslov={`${formatDatumDan(termin.pocetak)} ${formatVrijeme(termin.pocetak)}–${formatVrijeme(termin.kraj)} · ${termin.grupa}`}>
          {termin.otkazan ? (
            <Poruka vrsta="upozorenje">Termin je otkazan i ne ulazi u izračun dolaznosti.</Poruka>
          ) : (
            <>
              {termin.buduci && <div className="mb-3"><Poruka vrsta="info">Termin još nije počeo.</Poruka></div>}
              <Evidencija kolegijId={kolegijId} terminId={terminId} studenti={studenti} spremljena={Boolean(termin.evidencija_spremljena_at)} />
            </>
          )}
        </Kartica>
      </div>
      <Kartica naslov="Detalji">
        <dl className="space-y-2 text-sm">
          <div><dt className="text-tekst-slab">Tip</dt><dd>{NAZIV_TIPA[termin.tip]}</dd></div>
          <div><dt className="text-tekst-slab">Tema</dt><dd>{termin.tema ?? "—"}</dd></div>
          <div><dt className="text-tekst-slab">Evidencija</dt><dd>{termin.evidencija_spremljena_at ? `spremljena ${formatDatumVrijeme(termin.evidencija_spremljena_at)}` : "nije spremljena"}</dd></div>
        </dl>
        <div className="mt-4 flex flex-col gap-2 border-t border-rub pt-4">
          <form action={otkaziAkcija.bind(null, kolegijId, terminId, !termin.otkazan)}>
            <Gumb varijanta="sekundarni" className="w-full">{termin.otkazan ? "Vrati termin" : "Otkaži termin"}</Gumb>
          </form>
          {!termin.evidencija_spremljena_at && (
            <form action={obrisi}>
              <Gumb varijanta="opasni" className="w-full">Obriši termin</Gumb>
            </form>
          )}
        </div>
      </Kartica>
    </div>
  );
}
