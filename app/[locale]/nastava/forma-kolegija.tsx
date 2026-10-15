"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Gumb, Odabir, Polje, Poruka } from "@/components/ui";
import {
  kreirajKolegijAkcija,
  type StanjeKolegija,
} from "./akcije";

export function FormaKolegija() {
  const [stanje, akcija, salje] = useActionState<
    StanjeKolegija,
    FormData
  >(kreirajKolegijAkcija, {});

  const t = useTranslations("courseForm");
  const locale = useLocale();

  return (
    <form action={akcija} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="locale" value={locale} />

      {stanje.greska && (
        <div className="sm:col-span-2">
          <Poruka vrsta="greska">{stanje.greska}</Poruka>
        </div>
      )}

      <Polje
        oznaka={t("fields.name")}
        name="naziv"
        required
        className="sm:col-span-2"
      />

      <Polje
        oznaka={t("fields.code")}
        name="sifra"
        required
      />

      <Polje
        oznaka={t("fields.academicYear")}
        name="akademska_godina"
        placeholder={t("placeholders.academicYear")}
        required
      />

      <Odabir
        oznaka={t("fields.semester")}
        name="semestar"
        defaultValue="zimski"
      >
        <option value="zimski">
          {t("semesters.winter")}
        </option>

        <option value="ljetni">
          {t("semesters.summer")}
        </option>
      </Odabir>

      <Polje
        oznaka={t("fields.teacherEmail")}
        name="nastavnik_email"
        type="email"
        pomoc={t("help.teacherEmail")}
      />

      <div className="sm:col-span-2">
        <Gumb type="submit" disabled={salje}>
          {salje ? t("submitting") : t("submit")}
        </Gumb>
      </div>
    </form>
  );
}