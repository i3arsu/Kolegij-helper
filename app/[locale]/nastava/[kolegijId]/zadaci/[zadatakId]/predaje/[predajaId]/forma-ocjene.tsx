
"use client";

import { useActionState, useState } from "react";
import {
  useLocale,
  useTranslations,
} from "next-intl";

import {
  Gumb,
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

type FormaOcjeneProps = {
  kolegijId: string;
  zadatakId: string;
  predajaId: string;
  maxBodova: string;
  predlosci: Predlozak[];
  pocetniKomentar: string;
  pocetniBodovi: string | null;
};

export function FormaOcjene({
  kolegijId,
  zadatakId,
  predajaId,
  maxBodova,
  predlosci,
  pocetniKomentar,
  pocetniBodovi,
}: FormaOcjeneProps) {
  const t = useTranslations("teacherSubmissionReview");
  const locale = useLocale();

  // Komentar koji se može uređivati.
  const [komentar, setKomentar] = useState(pocetniKomentar);

  // Trenutačno odabrani predložak.
  const [predlozakId, setPredlozakId] = useState("");

  // Server Action za ocjenjivanje predaje.
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

  // Zajednički stil polja obrasca.
  const stilPolja =
    "w-full rounded-md border border-rub bg-povrsina px-3 py-2 text-sm";

  // Dodavanje predloška bez brisanja postojećeg komentara.
  function dodajPredlozak(id: string) {
    const odabrani = predlosci.find(
      (predlozak) => predlozak.id === id,
    );

    if (!odabrani) {
      return;
    }

    setKomentar((trenutni) =>
      trenutni.trim()
        ? `${trenutni.trimEnd()}\n\n${odabrani.tekst}`
        : odabrani.tekst,
    );

    // Omogućuje ponovno odabiranje istog predloška.
    setPredlozakId("");
  }

  return (
    <form action={akcija} className="space-y-4">
      {/* Jezik obrasca */}
      <input
        type="hidden"
        name="locale"
        value={locale}
      />

      {/* Rezultat server akcije */}
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

      {/* Predlošci komentara */}
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
          onChange={(event) =>
            dodajPredlozak(event.target.value)
          }
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

      {/* Komentar */}
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
          defaultValue={pocetniBodovi ?? ""}
          className={stilPolja}
        />

        <p className="text-xs text-tekst-slab">
          {t("maximumPoints", {
            max: maxBodova,
          })}
        </p>
      </div>

      {/* Rok za doradu */}
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
        <Gumb
          type="submit"
          name="odluka"
          value="prihvaceno"
          varijanta="primarni"
          disabled={salje}
        >
          {salje ? t("saving") : t("accept")}
        </Gumb>

        <Gumb
          type="submit"
          name="odluka"
          value="vraceno_na_doradu"
          varijanta="sekundarni"
          disabled={salje}
        >
          {salje ? t("saving") : t("returnForRevision")}
        </Gumb>
      </div>
    </form>
  );
}