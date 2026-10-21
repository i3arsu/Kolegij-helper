"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  Gumb,
  GumbLink,
  Polje,
  Poruka,
} from "@/components/ui";

import {
  noviZadatakAkcija,
  type Stanje,
} from "../akcije";

type GrupaOpcija = {
  id: string;
  naziv: string;
  tip: "predavanje" | "vjezbe";
};

export function FormaZadatka({
  kolegijId,
  grupe,
  defaultDatum,
}: {
  kolegijId: string;
  grupe: GrupaOpcija[];
  defaultDatum: string;
}) {
  const t = useTranslations("teacherAssignmentForm");
  const locale = useLocale();

  const [cilj, postaviCilj] = useState("cijeli_kolegij");

  const [stanje, akcija, salje] =
    useActionState<Stanje, FormData>(
      noviZadatakAkcija.bind(null, kolegijId),
      {},
    );

  if (stanje.ok) {
    return (
      <div className="space-y-3">
        <Poruka vrsta="uspjeh">{stanje.ok}</Poruka>
        <GumbLink href={`/nastava/${kolegijId}/zadaci`}>
          {t("backToList")}
        </GumbLink>
      </div>
    );
  }

  return (
    <form action={akcija} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />

      {stanje.greska && (
        <Poruka vrsta="greska">{stanje.greska}</Poruka>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Polje
          oznaka={t("fields.title")}
          name="naslov"
          maxLength={200}
          required
          className="sm:col-span-2"
        />

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium">
            {t("fields.description")}
          </span>
          <textarea
            name="opis"
            rows={5}
            maxLength={20000}
            className="rounded-md border border-rub bg-povrsina px-3 py-2"
          />
        </label>

        <Polje
          oznaka={t("fields.deadlineDate")}
          name="datum"
          type="date"
          defaultValue={defaultDatum}
          required
        />

        <Polje
          oznaka={t("fields.deadlineTime")}
          name="vrijeme"
          type="time"
          defaultValue="23:59"
          required
        />

        <Polje
          oznaka={t("fields.maxPoints")}
          name="max_bodova"
          type="number"
          min="0.01"
          max="9999.99"
          step="0.01"
          defaultValue="10"
          required
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">
          {t("methodsTitle")}
        </legend>

        {(
          [
            ["datoteka", t("methods.datoteka")],
            ["link", t("methods.link")],
            ["tekst", t("methods.tekst")],
          ] as const
        ).map(([vrijednost, naziv]) => (
          <label
            key={vrijednost}
            className="flex items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              name="nacini_predaje"
              value={vrijednost}
              defaultChecked={vrijednost === "datoteka"}
              className="accent-current"
            />
            {naziv}
          </label>
        ))}
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="dopusti_kasnu_predaju"
          defaultChecked
          className="accent-current"
        />
        {t("allowLate")}
      </label>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-medium">
          {t("audience")}
        </legend>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="cilj"
            value="cijeli_kolegij"
            checked={cilj === "cijeli_kolegij"}
            onChange={() => postaviCilj("cijeli_kolegij")}
          />
          {t("wholeCourse")}
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="cilj"
            value="grupe"
            checked={cilj === "grupe"}
            onChange={() => postaviCilj("grupe")}
          />
          {t("selectedGroups")}
        </label>

        {cilj === "grupe" && (
          <div className="space-y-3 rounded-md border border-rub p-3">
            <p className="text-sm text-tekst-slab">
              {t("groupsHelp")}
            </p>

            {grupe.length === 0 ? (
              <Poruka vrsta="upozorenje">
                {t("noGroups")}
              </Poruka>
            ) : (
              <div className="space-y-2">
                {grupe.map((grupa) => (
                  <label
                    key={grupa.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="grupaIds"
                      value={grupa.id}
                      className="accent-current"
                    />
                    <span>{grupa.naziv}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Gumb type="submit" disabled={salje}>
          {salje ? t("saving") : t("createDraft")}
        </Gumb>

        <GumbLink href={`/nastava/${kolegijId}/zadaci`}>
          {t("cancel")}
        </GumbLink>
      </div>
    </form>
  );
}