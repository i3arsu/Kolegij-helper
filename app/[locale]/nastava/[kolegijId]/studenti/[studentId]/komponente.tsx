"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Gumb, Odabir, Polje, Poruka } from "@/components/ui";
import {
  promjenaGrupeAkcija,
  resetLozinkeAkcija,
  type StanjeGrupe,
  type StanjeReseta,
} from "./akcije";

export function ResetLozinke({
  kolegijId,
  studentId,
}: {
  kolegijId: string;
  studentId: string;
}) {
  const [stanje, akcija, salje] = useActionState<
    StanjeReseta,
    FormData
  >(
    resetLozinkeAkcija.bind(null, kolegijId, studentId),
    {},
  );

  const t = useTranslations("teacherStudentProfile");
  const locale = useLocale();

  return (
    <form
      action={akcija}
      onSubmit={(e) => {
        if (!confirm(t("resetConfirm"))) {
          e.preventDefault();
        }
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="locale" value={locale} />

      {stanje.greska && (
        <Poruka vrsta="greska">{stanje.greska}</Poruka>
      )}

      {stanje.lozinka && (
        <Poruka vrsta="uspjeh">
          {t("newPasswordShown")}{" "}
          <code className="select-all text-base font-semibold">
            {stanje.lozinka}
          </code>
          <br />
          {t("mustChangePassword")}
        </Poruka>
      )}

      <Gumb varijanta="sekundarni" disabled={salje}>
        {salje ? t("resettingPassword") : t("resetPassword")}
      </Gumb>
    </form>
  );
}

export function PromjenaGrupe({
  kolegijId,
  upisId,
  grupe,
  danas,
}: {
  kolegijId: string;
  upisId: string;
  grupe: { id: string; naziv: string; tip: string }[];
  danas: string;
}) {
  const [stanje, akcija, salje] = useActionState<
    StanjeGrupe,
    FormData
  >(
    promjenaGrupeAkcija.bind(null, kolegijId, upisId),
    {},
  );

  const t = useTranslations("teacherStudentProfile");
  const locale = useLocale();

  return (
    <form action={akcija} className="flex flex-col gap-3">
      <input type="hidden" name="locale" value={locale} />

      {stanje.greska && (
        <Poruka vrsta="greska">{stanje.greska}</Poruka>
      )}

      {stanje.ok && (
        <Poruka vrsta="uspjeh">{t("groupChanged")}</Poruka>
      )}

      <Odabir
        oznaka={t("newGroup")}
        name="grupa_id"
        required
        defaultValue=""
      >
        <option value="" disabled>
          {t("chooseGroup")}
        </option>

        {grupe.map((g) => (
          <option key={g.id} value={g.id}>
            {g.naziv} ({g.tip === "predavanje" ? "P" : "V"})
          </option>
        ))}
      </Odabir>

      <Polje
        oznaka={t("validFrom")}
        name="datum"
        type="date"
        defaultValue={danas}
        required
        pomoc={t("groupDateHelp")}
      />

      <Gumb varijanta="sekundarni" disabled={salje}>
        {salje ? t("changingGroup") : t("changeGroup")}
      </Gumb>
    </form>
  );
}