import { notFound } from "next/navigation";
import { NavKolegija } from "@/components/nav-kolegija";
import { upit, zahtijevajOsoblje } from "@/lib/auth/guard";
import { kolegij } from "@/lib/servisi/kolegij";

export default async function KolegijLayout({ children, params }: LayoutProps<"/nastava/[kolegijId]">) {
  const { kolegijId } = await params;
  const uloga = await zahtijevajOsoblje(kolegijId);
  const k = await upit((tx) => kolegij(tx, kolegijId));
  if (!k) notFound();
  const stavke = [
    { put: "", naziv: "Sažetak" },
    { put: "studenti", naziv: "Studenti" },
    { put: "termini", naziv: "Termini" },
    { put: "grupe", naziv: "Grupe" },
    ...(uloga === "nastavnik"
      ? [{ put: "uvoz", naziv: "Uvoz CSV" }, { put: "postavke", naziv: "Postavke" }]
      : []),
  ];
  return (
    <>
      <div className="mb-2 text-sm text-tekst-slab">
        {k.sifra} · {k.akademska_godina} · {uloga === "nastavnik" ? "nastavnik" : "asistent"}
      </div>
      <h1 className="mb-4 text-2xl font-semibold">{k.naziv}</h1>
      <NavKolegija osnova={`/nastava/${kolegijId}`} stavke={stavke} />
      {children}
    </>
  );
}
