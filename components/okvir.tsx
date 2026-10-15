
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { Profil } from "@/lib/auth/guard";
import { SelektorJezika } from "./selektor-jezika";

export function Okvir({
  profil,
  children,
  pocetna,
}: {
  profil: Profil;
  children: ReactNode;
  pocetna: string;
}) {
  const t = useTranslations("header");

  const ime = profil.osoblje
    ? [profil.osoblje.titula, profil.osoblje.ime, profil.osoblje.prezime]
        .filter(Boolean)
        .join(" ")
    : profil.student
      ? `${profil.student.ime} ${profil.student.prezime}`
      : profil.email;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-rub bg-povrsina">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href={pocetna} className="font-semibold">
            {t("appName")}
          </Link>

          <div className="flex flex-wrap items-center gap-3 text-sm sm:gap-4">
            <SelektorJezika />

            <span className="text-tekst-slab">{ime}</span>

            <Link
              href="/promjena-lozinke"
              className="underline-offset-2 hover:underline"
            >
              {t("password")}
            </Link>

            <form action="/odjava" method="post">
              <button className="underline-offset-2 hover:underline">
                {t("logout")}
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
