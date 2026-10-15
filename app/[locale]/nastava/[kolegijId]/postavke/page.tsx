import { notFound } from "next/navigation";
import { Gumb, Kartica, Tablica } from "@/components/ui";
import { upit, zahtijevajNastavnika } from "@/lib/auth/guard";
import { osobljeKolegija, pravilaProlaza } from "@/lib/servisi/kolegij";
import { ukloniOsobljeAkcija } from "./akcije";
import { FormaOsoblja, FormaPravila } from "./forme";

export default async function Postavke({ params }: PageProps<"/[locale]/nastava/[kolegijId]/postavke">) {
  const { kolegijId } = await params;
  await zahtijevajNastavnika(kolegijId);
  const { pravila, osoblje, ja } = await upit(async (tx, profil) => ({
    pravila: await pravilaProlaza(tx, kolegijId),
    osoblje: await osobljeKolegija(tx, kolegijId),
    ja: profil.osoblje?.id,
  }));
  if (!pravila) notFound();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Kartica naslov="Pravila prolaza">
        <FormaPravila kolegijId={kolegijId} pravila={pravila} />
      </Kartica>
      <Kartica naslov="Osoblje kolegija">
        <Tablica>
          <thead><tr><th>Ime</th><th>Uloga</th><th /></tr></thead>
          <tbody>
            {osoblje.map((o) => (
              <tr key={o.id}>
                <td>{[o.titula, o.ime, o.prezime].filter(Boolean).join(" ")}</td>
                <td>{o.uloga}</td>
                <td className="text-right">
                  {o.id !== ja && (
                    <form action={ukloniOsobljeAkcija.bind(null, kolegijId, o.id)}>
                      <Gumb varijanta="opasni" className="px-2 py-1 text-xs">Ukloni</Gumb>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Tablica>
        <div className="mt-4"><FormaOsoblja kolegijId={kolegijId} /></div>
      </Kartica>
    </div>
  );
}
