import type { Metadata } from "next";
import { zahtijevajProfil } from "@/lib/auth/guard";
import { FormaPromjene } from "./forma";

export const metadata: Metadata = { title: "Promjena lozinke" };

export default async function StranicaPromjeneLozinke() {
  const profil = await zahtijevajProfil({ dopustiPromjenuLozinke: true });
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Promjena lozinke</h1>
        <p className="mt-1 text-sm text-tekst-slab">
          {profil.moraPromijenitiLozinku
            ? "Prije nastavka postavite vlastitu lozinku umjesto dodijeljene."
            : "Nakon promjene bit ćete odjavljeni na svim ostalim uređajima."}
        </p>
      </div>
      <FormaPromjene />
    </main>
  );
}
