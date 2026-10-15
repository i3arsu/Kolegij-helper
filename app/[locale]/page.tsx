import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { zahtijevajProfil } from "@/lib/auth/guard";

type Locale = (typeof routing.locales)[number];

type Props = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { locale } = await params;

  const t = await getTranslations({
    locale,
    namespace: "home",
  });

  return {
    title: t("metaTitle"),
  };
}

export default async function Pocetna({ params }: Props) {
  const { locale } = await params;

  const profil = await zahtijevajProfil();

  const jeOsoblje = Boolean(profil.osoblje) || profil.jeAdmin;

  // Los usuarios con un único rol van directamente a su panel.
  if (jeOsoblje && !profil.student) {
    redirect({ href: "/nastava", locale });
  }

  if (profil.student && !jeOsoblje) {
    redirect({ href: "/moj", locale });
  }

  const t = await getTranslations("home");

  // El usuario todavía no está asociado a ningún curso.
  if (!jeOsoblje && !profil.student) {
    return (
      <main className="mx-auto max-w-md p-8">
        <p className="text-sm leading-6 text-slate-600">
          {t("noCourseAccess")}
        </p>
      </main>
    );
  }

  // El usuario tiene ambos roles: puede elegir qué panel utilizar.
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">
        {t("chooseRole")}
      </h1>

      <Link
        href="/nastava"
        className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        {t("teachingStaff")}
      </Link>

      <Link
        href="/moj"
        className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-3 font-medium transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        {t("myCoursesStudent")}
      </Link>

      <Link
        href="/promjena-lozinke"
        className="text-sm underline underline-offset-4"
      >
        {t("passwordChange")}
      </Link>
    </main>
  );
}