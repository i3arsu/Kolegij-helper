
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { NavKolegija } from "@/components/nav-kolegija";
import { upit, zahtijevajStudenta } from "@/lib/auth/guard";
import { kolegij } from "@/lib/servisi/kolegij";

export default async function MojKolegijLayout({
  children,
  params,
}: LayoutProps<"/[locale]/moj/[kolegijId]">) {
  const { kolegijId } = await params;

  await zahtijevajStudenta(kolegijId);

  const k = await upit((tx) => kolegij(tx, kolegijId));

  if (!k) notFound();

  const t = await getTranslations("studentCourse");

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">{k.naziv}</h1>

      <NavKolegija
        osnova={`/moj/${kolegijId}`}
        stavke={[
          { put: "", naziv: t("overviewTab") },
          { put: "dolaznost", naziv: t("attendanceTab") },
        ]}
      />

      {children}
    </>
  );
}