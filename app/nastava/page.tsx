import type { Metadata } from "next";
import Link from "next/link";
import { Kartica, Naslov, Oznaka } from "@/components/ui";
import { upit } from "@/lib/auth/guard";
import { mojiKolegiji } from "@/lib/servisi/kolegij";
import { FormaKolegija } from "./forma-kolegija";

export const metadata: Metadata = { title: "Moji kolegiji" };

export default async function StranicaNastave() {
  const { kolegiji, jeAdmin } = await upit(async (tx, profil) => ({ kolegiji: await mojiKolegiji(tx), jeAdmin: profil.jeAdmin }));
  return (
    <>
      <Naslov>Kolegiji</Naslov>
      {kolegiji.length === 0 ? (
        <p className="text-tekst-slab">Još niste dodani ni na jedan kolegij.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {kolegiji.map((k) => (
            <li key={k.id}>
              <Link href={`/nastava/${k.id}`} className="block rounded-lg border border-rub bg-povrsina p-4 hover:border-naglasak">
                <div className="font-medium">{k.naziv}</div>
                <div className="mt-1 flex gap-2 text-sm text-tekst-slab">
                  {k.sifra} · {k.akademska_godina} · {k.semestar}
                  {k.arhiviran && <Oznaka>arhiviran</Oznaka>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {jeAdmin && (
        <Kartica naslov="Novi kolegij" className="mt-8 max-w-xl">
          <FormaKolegija />
        </Kartica>
      )}
    </>
  );
}
