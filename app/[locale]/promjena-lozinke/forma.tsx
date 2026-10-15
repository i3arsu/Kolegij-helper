
"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Gumb, Polje, Poruka } from "@/components/ui";
import {
  promjenaLozinkeAkcija,
  type StanjePromjene,
} from "./akcije";

export function FormaPromjene() {
  const t = useTranslations("passwordChange");
  const locale = useLocale();

  const [stanje, akcija, salje] = useActionState<
    StanjePromjene,
    FormData
  >(promjenaLozinkeAkcija, {});

  return (
    <form action={akcija} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />

      {stanje.greska && (
        <Poruka vrsta="greska">{stanje.greska}</Poruka>
      )}

      <Polje
        oznaka={t("currentPassword")}
        name="stara"
        type="password"
        autoComplete="current-password"
        required
      />

      <Polje
        oznaka={t("newPassword")}
        name="nova"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        pomoc={t("minimumLength")}
      />

      <Polje
        oznaka={t("confirmPassword")}
        name="potvrda"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
      />

      <Gumb type="submit" disabled={salje}>
        {salje ? t("submitting") : t("submit")}
      </Gumb>
    </form>
  );
}