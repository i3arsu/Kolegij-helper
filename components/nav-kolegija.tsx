
"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export function NavKolegija({
  osnova,
  stavke,
}: {
  osnova: string;
  stavke: { put: string; naziv: string }[];
}) {
  const t = useTranslations("courseNavigation");
  const putanja = usePathname();

  return (
    <nav
      className="mb-6 flex flex-wrap gap-1 border-b border-rub text-sm"
      aria-label={t("ariaLabel")}
    >
      {stavke.map((s) => {
        const href = s.put ? `${osnova}/${s.put}` : osnova;

        const aktivna = s.put
          ? putanja === href || putanja.startsWith(`${href}/`)
          : putanja === osnova;

        return (
          <Link
            key={href}
            href={href}
            aria-current={aktivna ? "page" : undefined}
            className="-mb-px border-b-2 border-transparent px-3 py-2 hover:border-rub aria-[current=page]:border-naglasak aria-[current=page]:font-medium"
          >
            {s.naziv}
          </Link>
        );
      })}
    </nav>
  );
}