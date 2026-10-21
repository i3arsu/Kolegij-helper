
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
  objaviZadatakAkcija,
  urediZadatakAkcija,
  type Stanje,
} from "../akcije";

type GrupaOpcija = {
  id: string;
  naziv: string;
  tip: "predavanje" | "vjezbe";
};

type PodaciZaUredivanje = {
  naslov: string;
  opis: string;
  datum: string;
  vrijeme: string;
  maxBodova: string;
  naciniPredaje: string[];
  dopustiKasnuPredaju: boolean;
  zaCijeliKolegij: boolean;
  grupaIds: string[];
};

export function FormaUrediZadatka({
  kolegijId,
  zadatakId,
  zadatak,
  grupe,
}: {
  kolegijId: string;
  zadatakId: string;
  zadatak: PodaciZaUredivanje;
  grupe: GrupaOpcija[];
}) {
  const t = useTranslations("teacherAssignmentForm");
  const locale = useLocale();

  const [cilj, postaviCilj] = useState(
    zadatak.zaCijeliKolegij
      ? "cijeli_kolegij"
      : "grupe",
  );

  const [stanje, akcija, salje] =
    useActionState<Stanje, FormData>(
      urediZadatakAkcija.bind(
        null,
        kolegijId,
        zadatakId,
      ),
      {},
    );

  return (
    <form action={akcija} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />

      {stanje.greska && (
        <Poruka vrsta="greska">{stanje.greska}</Poruka>
      )}

      {stanje.ok && (
        <Poruka vrsta="uspjeh">{stanje.ok}</Poruka>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Polje
          oznaka={t("fields.title")}
          name="naslov"
          maxLength={200}
          defaultValue={zadatak.naslov}
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
            defaultValue={zadatak.opis}
            className="rounded-md border border-rub bg-povrsina px-3 py-2"
          />
        </label>

        <Polje
          oznaka={t("fields.deadlineDate")}
          name="datum"
          type="date"
          defaultValue={zadatak.datum}
          required
        />

        <Polje
          oznaka={t("fields.deadlineTime")}
          name="vrijeme"
          type="time"
          defaultValue={zadatak.vrijeme}
          required
        />

        <Polje
          oznaka={t("fields.maxPoints")}
          name="max_bodova"
          type="number"
          min="0.01"
          max="9999.99"
          step="0.01"
          defaultValue={zadatak.maxBodova}
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
              defaultChecked={zadatak.naciniPredaje.includes(
                vrijednost,
              )}
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
          defaultChecked={zadatak.dopustiKasnuPredaju}
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
                      defaultChecked={zadatak.grupaIds.includes(
                        grupa.id,
                      )}
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
          {salje ? t("saving") : t("saveChanges")}
        </Gumb>

        <GumbLink href={`/nastava/${kolegijId}/zadaci`}>
          {t("backToList")}
        </GumbLink>
      </div>
    </form>
  );
}

export function FormaObjave({
  kolegijId,
  zadatakId,
}: {
  kolegijId: string;
  zadatakId: string;
}) {
  const t = useTranslations("teacherAssignmentForm");
  const locale = useLocale();

  const [stanje, akcija, salje] =
    useActionState<Stanje, FormData>(
      objaviZadatakAkcija.bind(
        null,
        kolegijId,
        zadatakId,
      ),
      {},
    );

  return (
    <form action={akcija} className="space-y-3">
      <input type="hidden" name="locale" value={locale} />

      {stanje.greska && (
        <Poruka vrsta="greska">{stanje.greska}</Poruka>
      )}

      <p className="text-sm text-tekst-slab">
        {t("publishHelp")}
      </p>

      <Gumb type="submit" disabled={salje}>
        {salje ? t("publishing") : t("publish")}
      </Gumb>
    </form>
  );
}