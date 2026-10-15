
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { zahtijevajProfil } from "@/lib/auth/guard";
import { FormaPromjene } from "./forma";

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
    namespace: "passwordChange",
  });

  return {
    title: t("metaTitle"),
  };
}

export default async function StranicaPromjeneLozinke({
  params,
}: Props) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const profil = await zahtijevajProfil({
    dopustiPromjenuLozinke: true,
  });

  const t = await getTranslations({
    locale,
    namespace: "passwordChange",
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>

        <p className="mt-1 text-sm text-tekst-slab">
          {profil.moraPromijenitiLozinku
            ? t("requiredDescription")
            : t("otherDevicesDescription")}
        </p>
      </div>

      <FormaPromjene />
    </main>
  );
}