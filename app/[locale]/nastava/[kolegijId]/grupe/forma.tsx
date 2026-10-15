"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Gumb, Odabir, Polje, Poruka } from "@/components/ui";
import { novaGrupaAkcija, type Stanje } from "./akcije";

export function FormaGrupe({ kolegijId }: { kolegijId: string }) {
  const t = useTranslations("teacherGroups");
  const locale = useLocale();
  const [stanje, akcija, salje] = useActionState<Stanje, FormData>(novaGrupaAkcija.bind(null, kolegijId), {});
  return (
    <form action={akcija} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="locale" value={locale} />
      {stanje.greska && <div className="w-full"><Poruka vrsta="greska">{stanje.greska}</Poruka></div>}
      <Polje oznaka={t("name")} name="naziv" placeholder="V4" required />
      <Odabir oznaka={t("type")} name="tip" defaultValue="vjezbe">
        <option value="predavanje">{t("types.predavanje")}</option>
        <option value="vjezbe">{t("types.vjezbe")}</option>
      </Odabir>
      <Gumb disabled={salje}>{t("add")}</Gumb>
    </form>
  );
}
