import { Kartica, TrakaPostotka } from "@/components/ui";
import { upit } from "@/lib/auth/guard";
import { NAZIV_TIPA } from "@/lib/domena/dolaznost";
import { formatDatumDan, formatVrijeme } from "@/lib/domena/vrijeme";
import { mojPregled } from "@/lib/servisi/student";

export default async function MojPregled({ params }: PageProps<"/moj/[kolegijId]">) {
  const { kolegijId } = await params;
  const p = await upit((tx, profil) => mojPregled(tx, kolegijId, profil.student!.id));
  const pravilo = (tip: string) =>
    p.pravila ? Number(tip === "predavanje" ? p.pravila.min_dolaznost_predavanja : p.pravila.min_dolaznost_vjezbi) : null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Kartica naslov="Dolaznost">
        <div className="space-y-4">
          {(["predavanje", "vjezbe"] as const).map((tip) => {
            const d = p.dolaznost.find((x) => x.tip === tip);
            const grupa = p.grupe.find((g) => g.tip === tip)?.naziv;
            if (!grupa && !d) return null;
            return (
              <div key={tip}>
                <TrakaPostotka
                  oznaka={`${NAZIV_TIPA[tip]}${grupa ? ` (${grupa})` : ""}`}
                  postotak={d?.postotak != null ? Number(d.postotak) : null}
                  prag={pravilo(tip)}
                />
                <p className="mt-1 text-xs text-tekst-slab">
                  {d ? `Prisutni ${d.prisutan} od ${d.odrzano} evidentiranih termina${d.opravdano ? `, opravdano ${d.opravdano}` : ""}.` : "Još nema evidentiranih termina."}
                </p>
              </div>
            );
          })}
        </div>
      </Kartica>
      <Kartica naslov="Sljedeći termini">
        {p.sljedeci.length === 0 ? <p className="text-sm text-tekst-slab">Nema zakazanih termina.</p> : (
          <ul className="space-y-1 text-sm">
            {p.sljedeci.map((t) => (
              <li key={t.id}>{formatDatumDan(t.pocetak)} {formatVrijeme(t.pocetak)}–{formatVrijeme(t.kraj)} · {t.grupa}{t.tema ? ` · ${t.tema}` : ""}</li>
            ))}
          </ul>
        )}
      </Kartica>
    </div>
  );
}
