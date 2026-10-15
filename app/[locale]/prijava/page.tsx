
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { dohvatiProfil } from "@/lib/auth/guard";
import { FormaPrijave } from "./forma";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const t = await getTranslations({
    locale,
    namespace: "login",
  });

  return {
    title: t("metaTitle"),
  };
}

export default async function StranicaPrijave({ params }: Props) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  if (await dohvatiProfil()) {
    redirect({ href: "/", locale });
  }

  const t = await getTranslations({
    locale,
    namespace: "login",
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-tekst-slab">
          {t("description")}
        </p>
      </div>

      <FormaPrijave />

      <p className="text-xs text-tekst-slab">
        {t("forgotPassword")} ·{" "}
        <Link className="underline" href="/privatnost">
          {t("privacy")}
        </Link>
      </p>
    </main>
  );
}