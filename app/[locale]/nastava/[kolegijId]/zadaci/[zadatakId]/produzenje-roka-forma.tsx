
"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  Gumb,
  Polje,
  Poruka,
} from "@/components/ui";

import {
  spremiProduzenjeRokaAkcija,
  ukloniProduzenjeRokaAkcija,
  type StanjeProduzenjaRoka,
} from "./akcije-produzenja-roka";

type ProduzenjeRokaFormaProps = {
  kolegijId: string;
  zadatakId: string;
  studentId: string;
  datum: string;
  vrijeme: string;
  razlog: string | null;
  postoji: boolean;
};

export function ProduzenjeRokaForma({
  kolegijId,
  zadatakId,
  studentId,
  datum,
  vrijeme,
  razlog,
  postoji,
}: ProduzenjeRokaFormaProps) {
  const t = useTranslations("teacherDeadlineExtensions");
  const locale = useLocale();

  const [stanje, akcija, salje] = useActionState<
    StanjeProduzenjaRoka,
    FormData
  >(
    spremiProduzenjeRokaAkcija.bind(
      null,
      kolegijId,
      zadatakId,
      studentId,
    ),
    {},
  );

  const [
    stanjeUklanjanja,
    akcijaUklanjanja,
    uklanja,
  ] = useActionState<
    StanjeProduzenjaRoka,
    FormData
  >(
    ukloniProduzenjeRokaAkcija.bind(
      null,
      kolegijId,
      zadatakId,
      studentId,
    ),
    {},
  );

  return (
    <div className="min-w-64 space-y-3">
      <p className="text-sm font-medium">
        {t(postoji ? "edit" : "grant")}
      </p>

      <form action={akcija} className="space-y-3">
        <input
          type="hidden"
          name="locale"
          value={locale}
        />

        {stanje.greska && (
          <Poruka vrsta="greska">
            {stanje.greska}
          </Poruka>
        )}

        {stanje.ok && (
          <Poruka vrsta="uspjeh">
            {stanje.ok}
          </Poruka>
        )}

        <div className="grid gap-3">
          <Polje
            oznaka={t("date")}
            name="datum"
            type="date"
            defaultValue={datum}
            required
          />

          <Polje
            oznaka={t("time")}
            name="vrijeme"
            type="time"
            defaultValue={vrijeme}
            required
          />

          <Polje
            oznaka={t("reason")}
            name="razlog"
            maxLength={500}
            defaultValue={razlog ?? ""}
          />
        </div>

        <Gumb type="submit" disabled={salje}>
          {salje ? t("saving") : t("save")}
        </Gumb>
      </form>

      {postoji && (
        <form action={akcijaUklanjanja}>
          <input
            type="hidden"
            name="locale"
            value={locale}
          />

          {stanjeUklanjanja.greska && (
            <Poruka vrsta="greska">
              {stanjeUklanjanja.greska}
            </Poruka>
          )}

          {stanjeUklanjanja.ok && (
            <Poruka vrsta="uspjeh">
              {stanjeUklanjanja.ok}
            </Poruka>
          )}

          <Gumb
            type="submit"
            varijanta="opasni"
            disabled={uklanja}
            className="mt-2"
          >
            {uklanja
              ? t("removing")
              : t("remove")}
          </Gumb>
        </form>
      )}
    </div>
  );
}