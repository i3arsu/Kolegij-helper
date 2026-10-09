import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { dohvatiProfil } from "@/lib/auth/guard";
import { FormaPrijave } from "./forma";

export const metadata: Metadata = { title: "Prijava" };

export default async function StranicaPrijave() {
  if (await dohvatiProfil()) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Praćenje studenata</h1>
        <p className="mt-1 text-sm text-tekst-slab">Prijavite se e-mail adresom i lozinkom koju ste dobili od nastavnika.</p>
      </div>
      <FormaPrijave />
      <p className="text-xs text-tekst-slab">
        Zaboravili ste lozinku? Javite se nastavniku kolegija. · <Link className="underline" href="/privatnost">Privatnost</Link>
      </p>
    </main>
  );
}
