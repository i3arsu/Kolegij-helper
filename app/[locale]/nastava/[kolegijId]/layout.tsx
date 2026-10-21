import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NavKolegija } from "@/components/nav-kolegija";
import { upit, zahtijevajOsoblje } from "@/lib/auth/guard";
import { kolegij } from "@/lib/servisi/kolegij";

export default async function KolegijLayout({
  children,
  params,
}: LayoutProps<"/[locale]/nastava/[kolegijId]">) {
  const { kolegijId } = await params;

  const uloga = await zahtijevajOsoblje(kolegijId);
  const k = await upit((tx) => kolegij(tx, kolegijId));

  if (!k) notFound();

  const t = await getTranslations("courseNavigation");

  const stavke = [
    { put: "", naziv: t("summary") },
    { put: "studenti", naziv: t("students") },
    { put: "termini", naziv: t("sessions") },
    { put: "zadaci", naziv: t("assignments") },
    { put: "grupe", naziv: t("groups") },
    ...(uloga === "nastavnik"
      ? [
          { put: "uvoz", naziv: t("csvImport") },
          { put: "postavke", naziv: t("settings") },
        ]
      : []),
  ];

  return (
    <>
      <div className="mb-2 text-sm text-tekst-slab">
        {k.sifra} · {k.akademska_godina} ·{" "}
        {uloga === "nastavnik"
          ? t("lecturer")
          : t("assistant")}
      </div>

      <h1 className="mb-4 text-2xl font-semibold">
        {k.naziv}
      </h1>

      <NavKolegija
        osnova={`/nastava/${kolegijId}`}
        stavke={stavke}
      />

      {children}
    </>
  );
}