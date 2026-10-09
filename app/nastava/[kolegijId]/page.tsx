import Link from "next/link";
import { Kartica } from "@/components/ui";
import { upit } from "@/lib/auth/guard";
import { formatDatumDan, formatVrijeme } from "@/lib/domena/vrijeme";
import { sazetakKolegija } from "@/lib/servisi/sazetak";

export default async function Sazetak({ params }: PageProps<"/nastava/[kolegijId]">) {
  const { kolegijId } = await params;
  const s = await upit((tx) => sazetakKolegija(tx, kolegijId));
  const osnova = `/nastava/${kolegijId}`;
  const brojka = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("hr-HR")} %`);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Kartica naslov="Pregled">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-tekst-slab">Studenata</dt><dd className="text-2xl font-semibold">{s.broj_studenata}</dd></div>
          <div />
          <div><dt className="text-tekst-slab">Prosj. dolaznost P</dt><dd className="text-2xl font-semibold">{brojka(s.prosjek_p)}</dd></div>
          <div><dt className="text-tekst-slab">Prosj. dolaznost V</dt><dd className="text-2xl font-semibold">{brojka(s.prosjek_v)}</dd></div>
        </dl>
      </Kartica>
      <Kartica naslov="Upozorenja">
        <ul className="space-y-2 text-sm">
          <li>
            <Link className="underline" href={`${osnova}/studenti?ispod=1`}>
              {s.ispod_p + s.ispod_v === 0 ? "Nema studenata ispod praga dolaznosti" : `Ispod praga dolaznosti: ${s.ispod_p} (P), ${s.ispod_v} (V)`}
            </Link>
          </li>
          {s.neevidentirani.length > 0 && (
            <li>Prošli termini bez evidencije: {s.neevidentirani.length}{s.neevidentirani.length === 6 ? "+" : ""}</li>
          )}
        </ul>
      </Kartica>
      <Kartica naslov="Sljedeći termini">
        {s.sljedeci.length === 0 ? <p className="text-sm text-tekst-slab">Nema zakazanih termina.</p> : (
          <ul className="space-y-1 text-sm">
            {s.sljedeci.map((t) => (
              <li key={t.id}><Link className="hover:underline" href={`${osnova}/termini/${t.id}`}>{formatDatumDan(t.pocetak)} {formatVrijeme(t.pocetak)} · {t.grupa}{t.tema ? ` · ${t.tema}` : ""}</Link></li>
            ))}
          </ul>
        )}
      </Kartica>
      <Kartica naslov="Nedostaje evidencija">
        {s.neevidentirani.length === 0 ? <p className="text-sm text-tekst-slab">Svi prošli termini su evidentirani.</p> : (
          <ul className="space-y-1 text-sm">
            {s.neevidentirani.map((t) => (
              <li key={t.id}><Link className="text-upozorenje hover:underline" href={`${osnova}/termini/${t.id}`}>{formatDatumDan(t.pocetak)} {formatVrijeme(t.pocetak)} · {t.grupa}</Link></li>
            ))}
          </ul>
        )}
      </Kartica>
    </div>
  );
}
