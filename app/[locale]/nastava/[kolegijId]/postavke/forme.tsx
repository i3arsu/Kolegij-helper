
"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Gumb, Odabir, Polje, Poruka } from "@/components/ui";
import {
  kreirajPredlozakAkcija,
  osobljeAkcija,
  pravilaAkcija,
  ukloniPredlozakAkcija,
  urediPredlozakAkcija,
  type Stanje,
} from "./akcije";

type Pravila = {
  min_dolaznost_predavanja: string;
  min_dolaznost_vjezbi: string;
  min_bodova: string;
  opravdano_se_racuna: string;
};

type PredlozakKomentara = {
  id: string;
  naslov: string;
  tekst: string;
};

export function FormaPravila({
  kolegijId,
  pravila,
}: {
  kolegijId: string;
  pravila: Pravila;
}) {
  const t = useTranslations("teacherSettings");
  const locale = useLocale();

  const [stanje, akcija, salje] = useActionState<Stanje, FormData>(
    pravilaAkcija.bind(null, kolegijId),
    {},
  );

  return (
    <form action={akcija} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="locale" value={locale} />

      {stanje.greska && (
        <div className="sm:col-span-2">
          <Poruka vrsta="greska">{stanje.greska}</Poruka>
        </div>
      )}

      {stanje.ok && (
        <div className="sm:col-span-2">
          <Poruka vrsta="uspjeh">{stanje.ok}</Poruka>
        </div>
      )}

      <Polje
        oznaka={t("minLectures")}
        name="min_dolaznost_predavanja"
        type="number"
        min={0}
        max={100}
        step="0.5"
        defaultValue={Number(pravila.min_dolaznost_predavanja)}
        required
      />

      <Polje
        oznaka={t("minExercises")}
        name="min_dolaznost_vjezbi"
        type="number"
        min={0}
        max={100}
        step="0.5"
        defaultValue={Number(pravila.min_dolaznost_vjezbi)}
        required
      />

      <Polje
        oznaka={t("minPoints")}
        name="min_bodova"
        type="number"
        min={0}
        step="0.5"
        defaultValue={Number(pravila.min_bodova)}
        required
        pomoc={t("minPointsHelp")}
      />

      <Odabir
        oznaka={t("excusedAbsence")}
        name="opravdano_se_racuna"
        defaultValue={pravila.opravdano_se_racuna}
      >
        <option value="izuzeto">{t("excused.izuzeto")}</option>
        <option value="kao_prisutan">{t("excused.kao_prisutan")}</option>
        <option value="kao_odsutan">{t("excused.kao_odsutan")}</option>
      </Odabir>

      <div className="sm:col-span-2">
        <Gumb disabled={salje}>{t("saveRules")}</Gumb>
      </div>
    </form>
  );
}

export function FormaOsoblja({
  kolegijId,
}: {
  kolegijId: string;
}) {
  const t = useTranslations("teacherSettings");
  const locale = useLocale();

  const [stanje, akcija, salje] = useActionState<Stanje, FormData>(
    osobljeAkcija.bind(null, kolegijId),
    {},
  );

  return (
    <form action={akcija} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="locale" value={locale} />

      {stanje.greska && (
        <div className="w-full">
          <Poruka vrsta="greska">{stanje.greska}</Poruka>
        </div>
      )}

      {stanje.ok && (
        <div className="w-full">
          <Poruka vrsta="uspjeh">{stanje.ok}</Poruka>
        </div>
      )}

      <Polje
        oznaka={t("staffEmail")}
        name="email"
        type="email"
        required
      />

      <Odabir oznaka={t("role")} name="uloga" defaultValue="asistent">
        <option value="asistent">{t("roles.asistent")}</option>
        <option value="nastavnik">{t("roles.nastavnik")}</option>
      </Odabir>

      <Gumb disabled={salje}>{t("add")}</Gumb>
    </form>
  );
}

// --------------------------------------------------
// Kreiranje predloška komentara
// --------------------------------------------------

export function FormaNoviPredlozak({
  kolegijId,
}: {
  kolegijId: string;
}) {
  const t = useTranslations("teacherSettings");
  const locale = useLocale();

  const [stanje, akcija, salje] = useActionState<Stanje, FormData>(
    kreirajPredlozakAkcija.bind(null, kolegijId),
    {},
  );

  return (
    <form action={akcija} className="grid gap-3">
      <input type="hidden" name="locale" value={locale} />

      {stanje.greska && (
        <Poruka vrsta="greska">{stanje.greska}</Poruka>
      )}

      {stanje.ok && (
        <Poruka vrsta="uspjeh">{stanje.ok}</Poruka>
      )}

      <Polje
        oznaka={t("templateTitle")}
        name="naslov"
        type="text"
        maxLength={120}
        required
      />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("templateText")}</span>
        <textarea
          name="tekst"
          rows={5}
          maxLength={5000}
          required
          className="resize-y rounded-md border border-rub bg-povrsina px-3 py-2"
        />
      </label>

      <div>
        <Gumb disabled={salje}>{t("createTemplate")}</Gumb>
      </div>
    </form>
  );
}

// --------------------------------------------------
// Uređivanje i uklanjanje predloška komentara
// --------------------------------------------------

export function FormaPredloska({
  kolegijId,
  predlozak,
}: {
  kolegijId: string;
  predlozak: PredlozakKomentara;
}) {
  const t = useTranslations("teacherSettings");
  const locale = useLocale();

  const [stanjeUredi, akcijaUredi, saljeUredi] =
    useActionState<Stanje, FormData>(
      urediPredlozakAkcija.bind(null, kolegijId, predlozak.id),
      {},
    );

  const [stanjeUkloni, akcijaUkloni, saljeUkloni] =
    useActionState<Stanje, FormData>(
      ukloniPredlozakAkcija.bind(null, kolegijId, predlozak.id),
      {},
    );

  return (
    <article className="grid gap-4 rounded-md border border-rub p-4">
      <form action={akcijaUredi} className="grid gap-3">
        <input type="hidden" name="locale" value={locale} />

        {stanjeUredi.greska && (
          <Poruka vrsta="greska">{stanjeUredi.greska}</Poruka>
        )}

        {stanjeUredi.ok && (
          <Poruka vrsta="uspjeh">{stanjeUredi.ok}</Poruka>
        )}

        <Polje
          oznaka={t("templateTitle")}
          name="naslov"
          type="text"
          maxLength={120}
          defaultValue={predlozak.naslov}
          required
        />

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("templateText")}</span>
          <textarea
            name="tekst"
            rows={5}
            maxLength={5000}
            defaultValue={predlozak.tekst}
            required
            className="resize-y rounded-md border border-rub bg-povrsina px-3 py-2"
          />
        </label>

        <div>
          <Gumb disabled={saljeUredi}>
            {t("updateTemplate")}
          </Gumb>
        </div>
      </form>

      <div className="border-t border-rub pt-3">
        <form action={akcijaUkloni} className="grid gap-3" onSubmit={(e) => {if (!window.confirm(t("deleteTemplateConfirm"))) {e.preventDefault();}}}>
          <input type="hidden" name="locale" value={locale} />

          {stanjeUkloni.greska && (
            <Poruka vrsta="greska">{stanjeUkloni.greska}</Poruka>
          )}

          <div>
            <Gumb
              varijanta="opasni"
              disabled={saljeUkloni}
            >
              {t("deleteTemplate")}
            </Gumb>
          </div>
        </form>
      </div>
    </article>
  );
}

// --------------------------------------------------
// Lista predložaka komentara
// --------------------------------------------------

export function FormePredlozaka({
  kolegijId,
  predlosci,
}: {
  kolegijId: string;
  predlosci: PredlozakKomentara[];
}) {
  return (
    <div className="grid gap-5">
      <FormaNoviPredlozak kolegijId={kolegijId} />

      {predlosci.map((predlozak) => (
        <FormaPredloska
          key={predlozak.id}
          kolegijId={kolegijId}
          predlozak={predlozak}
        />
      ))}
    </div>
  );
}