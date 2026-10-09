import Link from "next/link";
import { Kartica, Tablica } from "@/components/ui";
import { ulogaNaKolegiju, upit } from "@/lib/auth/guard";
import { NAZIV_TIPA } from "@/lib/domena/dolaznost";
import { grupeSAsistentima, osobljeKolegija } from "@/lib/servisi/kolegij";
import { asistentAkcija } from "./akcije";
import { FormaGrupe } from "./forma";

export default async function Grupe({ params }: PageProps<"/nastava/[kolegijId]/grupe">) {
  const { kolegijId } = await params;
  const uloga = await ulogaNaKolegiju(kolegijId);
  const { grupe, asistenti } = await upit(async (tx) => ({
    grupe: await grupeSAsistentima(tx, kolegijId),
    asistenti: (await osobljeKolegija(tx, kolegijId)).filter((o) => o.uloga === "asistent"),
  }));
  return (
    <div className="space-y-4">
      <Tablica>
        <thead><tr><th>Grupa</th><th>Tip</th><th>Studenata</th><th>Asistenti</th></tr></thead>
        <tbody>
          {grupe.map((g) => (
            <tr key={g.id}>
              <td><Link className="font-medium hover:underline" href={`/nastava/${kolegijId}/studenti?grupa=${encodeURIComponent(g.naziv)}`}>{g.naziv}</Link></td>
              <td>{NAZIV_TIPA[g.tip]}</td>
              <td>{g.broj_studenata}</td>
              <td>
                {uloga === "nastavnik" && asistenti.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {asistenti.map((a) => {
                      const dodijeljen = g.asistenti.some((x) => x.id === a.id);
                      return (
                        <form key={a.id} action={asistentAkcija.bind(null, kolegijId, g.id, a.id, !dodijeljen)}>
                          <button
                            className={`rounded-full border px-2 py-0.5 text-xs ${dodijeljen ? "border-naglasak bg-naglasak/10" : "border-rub text-tekst-slab"}`}
                            aria-pressed={dodijeljen}
                            title={dodijeljen ? "Ukloni iz grupe" : "Dodijeli grupi"}
                          >
                            {a.ime} {a.prezime}
                          </button>
                        </form>
                      );
                    })}
                  </div>
                ) : (
                  g.asistenti.map((a) => `${a.ime} ${a.prezime}`).join(", ") || "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Tablica>
      {uloga === "nastavnik" && (
        <Kartica naslov="Nova grupa"><FormaGrupe kolegijId={kolegijId} /></Kartica>
      )}
    </div>
  );
}
