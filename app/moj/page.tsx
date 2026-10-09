import type { Metadata } from "next";
import Link from "next/link";
import { Naslov } from "@/components/ui";
import { upit } from "@/lib/auth/guard";
import { mojiKolegiji } from "@/lib/servisi/kolegij";

export const metadata: Metadata = { title: "Moji kolegiji" };

export default async function MojiKolegiji() {
  const kolegiji = await upit((tx) => mojiKolegiji(tx));
  return (
    <>
      <Naslov>Moji kolegiji</Naslov>
      {kolegiji.length === 0 ? (
        <p className="text-tekst-slab">Niste upisani ni na jedan aktivni kolegij.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {kolegiji.map((k) => (
            <li key={k.id}>
              <Link href={`/moj/${k.id}`} className="block rounded-lg border border-rub bg-povrsina p-4 hover:border-naglasak">
                <div className="font-medium">{k.naziv}</div>
                <div className="mt-1 text-sm text-tekst-slab">{k.akademska_godina} · {k.semestar}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
