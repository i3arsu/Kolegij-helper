import { redirect } from "next/navigation";
import Link from "next/link";
import { zahtijevajProfil } from "@/lib/auth/guard";
import { GumbLink } from "@/components/ui";

export default async function Pocetna() {
  const profil = await zahtijevajProfil();
  const jeOsoblje = Boolean(profil.osoblje) || profil.jeAdmin;
  if (jeOsoblje && !profil.student) redirect("/nastava");
  if (profil.student && !jeOsoblje) redirect("/moj");
  if (!jeOsoblje && !profil.student) {
    return (
      <main className="mx-auto max-w-md p-8">
        <p>Vaš račun nije povezan ni s jednim kolegijem. Javite se nastavniku.</p>
      </main>
    );
  }
  // Osoba je i osoblje i student: izbor uloge.
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Odaberite ulogu</h1>
      <GumbLink href="/nastava">Nastava (osoblje)</GumbLink>
      <GumbLink href="/moj">Moji kolegiji (student)</GumbLink>
      <Link href="/promjena-lozinke" className="text-sm underline">Promjena lozinke</Link>
    </main>
  );
}
