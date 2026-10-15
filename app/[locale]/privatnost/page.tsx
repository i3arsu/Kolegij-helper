import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { locale } = await params;

  const t = await getTranslations({
    locale,
    namespace: "privacy",
  });

  return {
    title: t("metaTitle"),
  };
}

export default async function Privatnost() {
  const t = await getTranslations("privacy");

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8 text-sm leading-6">
      <h1 className="text-2xl font-semibold">
        {t("title")}
      </h1>

      <p>{t("dataProcessed")}</p>

      <p>{t("storageAndAccess")}</p>

      <p>
        {t("retentionContact")}{" "}
        <em>{t("fillIn")}</em>
      </p>
    </main>
  );
}