
"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Gumb, Polje, Poruka } from "@/components/ui";
import {
  prijavaAkcija,
  type StanjePrijave,
} from "./akcije";

export function FormaPrijave() {
  const t = useTranslations("login");
  const locale = useLocale();

  const [stanje, akcija, salje] = useActionState<
    StanjePrijave,
    FormData
  >(prijavaAkcija, {});

  return (
    <form action={akcija} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />

      {stanje.greska && (
        <Poruka vrsta="greska">{stanje.greska}</Poruka>
      )}

      <Polje
        oznaka={t("email")}
        name="email"
        type="email"
        autoComplete="username"
        required
        defaultValue={stanje.email}
      />

      <Polje
        oznaka={t("password")}
        name="lozinka"
        type="password"
        autoComplete="current-password"
        required
      />

      <Gumb type="submit" disabled={salje}>
        {salje ? t("submitting") : t("submit")}
      </Gumb>
    </form>
  );
}