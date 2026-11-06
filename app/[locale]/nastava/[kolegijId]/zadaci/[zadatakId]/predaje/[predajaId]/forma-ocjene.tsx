
"use client";

import { useActionState, useState } from "react";
import {
  useLocale,
  useTranslations,
} from "next-intl";

import {
  Poruka,
} from "@/components/ui";

import {
  ocijeniPregledAkcija,
  type StanjePregleda,
} from "./akcije";

type Predlozak = {
  id: string;
  naslov: string;
  tekst: string;
};

export function FormaOcjene({
  kolegijId,
  zadatakId,
  predajaId,
  maxBodova,
  predlosci,
}: {
  kolegijId: string;
  zadatakId: string;
  predajaId: string;
  maxBodova: string;
  predlosci: Predlozak[];
}) {
  const t = useTranslations("teacherSubmissionReview");
  const locale = useLocale();

  const [komentar, setKomentar] = useState("");
  const [predlozakId, setPredlozakId] = useState("");

  const [stanje, akcija, salje] = useActionState<
    StanjePregleda,
    FormData
  >(
    ocijeniPregledAkcija.bind(
      null,
      kolegijId,
      zadatakId,
      predajaId,
    ),
    {},
  );

  const stilPolja =
    "w-full rounded-md border border-rub bg-povrsina px-3 py-2 text-sm";

  return (
    <form action={akcija} className="space-y-4">
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

      {/* Izbor predloška komentara */}
      <div className="space-y-1">
        <label
          htmlFor="predlozak-komentara"
          className="block text-sm font-medium"
        >
          {t("commentTemplate")}
        </label>

        <select
          id="predlozak-komentara"
          value={predlozakId}
          onChange={(event) => {
            const id = event.target.value;

            setPredlozakId(id);

            const odabrani = predlosci.find(
              (predlozak) => predlozak.id === id,
            );

            if (odabrani) {
              setKomentar(odabrani.tekst);
            }
          }}
          className={stilPolja}
        >
          <option value="">
            {t("chooseTemplate")}
          </option>

          {predlosci.map((predlozak) => (
            <option
              key={predlozak.id}
              value={predlozak.id}
            >
              {predlozak.naslov}
            </option>
          ))}
        </select>
      </div>

      {/* Komentar koji se može uređivati */}
      <div className="space-y-1">
        <label
          htmlFor="komentar-predaje"
          className="block text-sm font-medium"
        >
          {t("comment")}
        </label>

        <textarea
          id="komentar-predaje"
          name="komentar"
          value={komentar}
          onChange={(event) =>
            setKomentar(event.target.value)
          }
          rows={6}
          maxLength={5000}
          required
          className={`${stilPolja} resize-y`}
          placeholder={t("commentPlaceholder")}
        />

        <p className="text-xs text-tekst-slab">
          {komentar.length} / 5000
        </p>
      </div>

      {/* Bodovi */}
      <div className="space-y-1">
        <label
          htmlFor="bodovi-predaje"
          className="block text-sm font-medium"
        >
          {t("pointsLabel")}
        </label>

        <input
          id="bodovi-predaje"
          name="bodovi"
          type="number"
          min="0"
          max={Number(maxBodova)}
          step="0.01"
          className={stilPolja}
        />

        <p className="text-xs text-tekst-slab">
          {t("maximumPoints", {
            max: maxBodova,
          })}
        </p>
      </div>

      {/* Opcionalni rok za doradu */}
      <div className="space-y-3 rounded-md border border-rub p-3">
        <h3 className="text-sm font-semibold">
          {t("revisionDeadline")}
        </h3>

        <p className="text-xs text-tekst-slab">
          {t("revisionDeadlineHelp")}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label
              htmlFor="datum-dorade"
              className="block text-sm font-medium"
            >
              {t("revisionDate")}
            </label>

            <input
              id="datum-dorade"
              type="date"
              name="datum_dorade"
              className={stilPolja}
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="vrijeme-dorade"
              className="block text-sm font-medium"
            >
              {t("revisionTime")}
            </label>

            <input
              id="vrijeme-dorade"
              type="time"
              name="vrijeme_dorade"
              className={stilPolja}
            />
          </div>
        </div>
      </div>

      {/* Odluka */}
      <div className="flex flex-wrap gap-3 border-t border-rub pt-4">
        <button
          type="submit"
          name="odluka"
          value="prihvaceno"
          disabled={salje}
          className="inline-flex items-center justify-center rounded-md bg-naglasak px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {salje ? t("saving") : t("accept")}
        </button>

        <button
          type="submit"
          name="odluka"
          value="vraceno_na_doradu"
          disabled={salje}
          className="inline-flex items-center justify-center rounded-md border border-rub bg-povrsina px-4 py-2 text-sm font-medium hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {salje ? t("saving") : t("returnForRevision")}
        </button>
      </div>
    </form>
  );
}