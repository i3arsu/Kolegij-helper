
"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTransition, type ChangeEvent } from "react";
import { routing } from "@/i18n/routing";

type Locale = (typeof routing.locales)[number];

export function SelektorJezika() {
  const locale = useLocale();
  const t = useTranslations("header");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function promijeniJezik(event: ChangeEvent<HTMLSelectElement>) {
    const noviJezik = event.currentTarget.value as Locale;

    if (noviJezik === locale) {
      return;
    }

    const query = searchParams.toString();
    const href = query ? `${pathname}?${query}` : pathname;

    startTransition(() => {
      router.replace(href, { locale: noviJezik });
    });
  }

  return (
    <div className="flex items-center gap-2">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0 text-tekst-slab"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
      </svg>

      <label htmlFor="selektor-jezika" className="sr-only">
        {t("language")}
      </label>

      <select
        id="selektor-jezika"
        value={locale}
        onChange={promijeniJezik}
        disabled={isPending}
        className="max-w-28 cursor-pointer rounded-md border border-rub bg-povrsina px-2 py-1.5 text-sm disabled:cursor-wait disabled:opacity-60"
      >
        <option value="hr">Hrvatski</option>
        <option value="en">English</option>
      </select>
    </div>
  );
}
