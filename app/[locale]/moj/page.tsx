
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Naslov } from "@/components/ui";
import { upit } from "@/lib/auth/guard";
import { mojiKolegiji } from "@/lib/servisi/kolegij";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { locale } = await params;

  const t = await getTranslations({
    locale,
    namespace: "studentHome",
  });

  return {
    title: t("metaTitle"),
  };
}

export default async function MojiKolegiji({ params }: Props) {
  const { locale } = await params;

  const t = await getTranslations({
    locale,
    namespace: "studentHome",
  });

  const kolegiji = await upit((tx) => mojiKolegiji(tx));

  const ts = await getTranslations("courseForm");

  return (
    <>
      <Naslov>{t("title")}</Naslov>

      {kolegiji.length === 0 ? (
        <p className="text-tekst-slab">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {kolegiji.map((k) => (
            <li key={k.id}>
              <Link
                href={`/moj/${k.id}`}
                className="block rounded-lg border border-rub bg-povrsina p-4 hover:border-naglasak"
              >
                <div className="font-medium">{k.naziv}</div>
                <div className="mt-1 text-sm text-tekst-slab">
                  {k.akademska_godina} · {ts(k.semestar === "ljetni" ? "semesters.summer" : "semesters.winter")}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}