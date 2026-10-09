import Link from "next/link";
import type { ReactNode } from "react";
import type { Profil } from "@/lib/auth/guard";

export function Okvir({ profil, children, pocetna }: { profil: Profil; children: ReactNode; pocetna: string }) {
  const ime = profil.osoblje
    ? [profil.osoblje.titula, profil.osoblje.ime, profil.osoblje.prezime].filter(Boolean).join(" ")
    : profil.student
      ? `${profil.student.ime} ${profil.student.prezime}`
      : profil.email;
  return (
    <div className="min-h-dvh">
      <header className="border-b border-rub bg-povrsina">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href={pocetna} className="font-semibold">Praćenje studenata</Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-tekst-slab">{ime}</span>
            <Link href="/promjena-lozinke" className="underline-offset-2 hover:underline">Lozinka</Link>
            <form action="/odjava" method="post">
              <button className="underline-offset-2 hover:underline">Odjava</button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
