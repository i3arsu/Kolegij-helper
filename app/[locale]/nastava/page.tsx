import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Kartica, Naslov, Oznaka } from "@/components/ui";
import { upit } from "@/lib/auth/guard";
import { mojiKolegiji } from "@/lib/servisi/kolegij";
import { FormaKolegija } from "./forma-kolegija";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("teacherHome");

  return {
    title: t("metaTitle"),
  };
}

export default async function StranicaNastave() {
  const t = await getTranslations("teacherHome");

  const { kolegiji, jeAdmin } = await upit(
    async (tx, profil) => ({
      kolegiji: await mojiKolegiji(tx),
      jeAdmin: profil.jeAdmin,
    }),
  );

  return (
    <>
      <Naslov>{t("heading")}</Naslov>

      {!jeAdmin && (
        kolegiji.length === 0 ? (
          <p className="text-tekst-slab">{t("empty")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {kolegiji.map((k) => (
              <li key={k.id}>
                <Link
                  href={`/nastava/${k.id}`}
                  className="block rounded-lg border border-rub bg-povrsina p-4 hover:border-naglasak"
                >
                  <div className="font-medium">{k.naziv}</div>

                  <div className="mt-1 flex gap-2 text-sm text-tekst-slab">
                    {k.sifra} · {k.akademska_godina} · {k.semestar}

                    {k.arhiviran && (
                      <Oznaka>{t("archived")}</Oznaka>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )
      )}

      {jeAdmin && (
        <Kartica
          naslov={t("newCourse")}
          className="mt-8 max-w-xl"
        >
          <FormaKolegija />
        </Kartica>
      )}
    </>
  );
}