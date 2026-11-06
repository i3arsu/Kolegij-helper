
"use client";

import { useActionState } from "react";
import {
  useLocale,
  useTranslations,
} from "next-intl";

import {
  Gumb,
  Poruka,
} from "@/components/ui";

import type { StatusPredaje } from "@/lib/db/tipovi";

import {
  otpustiPregledAkcija,
  preuzmiPregledAkcija,
  ponovnoOtvoriPredajuAkcija,
  type StanjePregleda,
} from "./akcije";

export function AkcijePregleda({
  kolegijId,
  zadatakId,
  predajaId,
  status,
  mozeOtpustiti,
  jeNastavnik,
}: {
  kolegijId: string;
  zadatakId: string;
  predajaId: string;
  status: StatusPredaje;
  mozeOtpustiti: boolean;
  jeNastavnik: boolean;
}) {
  const t = useTranslations("teacherSubmissionReview");
  const locale = useLocale();

  // Acción para reclamar la revisión.
  const [
    stanjePreuzmi,
    akcijaPreuzmi,
    saljePreuzmi,
  ] = useActionState<StanjePregleda, FormData>(
    preuzmiPregledAkcija.bind(
      null,
      kolegijId,
      zadatakId,
      predajaId,
    ),
    {},
  );

  // Acción para liberar la revisión.
  const [
    stanjeOtpusti,
    akcijaOtpusti,
    saljeOtpusti,
  ] = useActionState<StanjePregleda, FormData>(
    otpustiPregledAkcija.bind(
      null,
      kolegijId,
      zadatakId,
      predajaId,
    ),
    {},
  );

  // Acción para reabrir una entrega aceptada.
  const [
    stanjePonovnoOtvori,
    akcijaPonovnoOtvori,
    saljePonovnoOtvori,
  ] = useActionState<StanjePregleda, FormData>(
    ponovnoOtvoriPredajuAkcija.bind(
      null,
      kolegijId,
      zadatakId,
      predajaId,
    ),
    {},
  );

  const pregledavaTrenutniKorisnik = mozeOtpustiti;

  return (
    <div className="space-y-3">

      {/* Resultado de reclamar la revisión */}
      {stanjePreuzmi.greska && (
        <Poruka vrsta="greska">
          {stanjePreuzmi.greska}
        </Poruka>
      )}

      {stanjePreuzmi.ok && (
        <Poruka vrsta="uspjeh">
          {stanjePreuzmi.ok}
        </Poruka>
      )}

      {/* Resultado de liberar la revisión */}
      {stanjeOtpusti.greska && (
        <Poruka vrsta="greska">
          {stanjeOtpusti.greska}
        </Poruka>
      )}

      {stanjeOtpusti.ok && (
        <Poruka vrsta="uspjeh">
          {stanjeOtpusti.ok}
        </Poruka>
      )}

      {/* Resultado de reabrir la entrega */}
      {stanjePonovnoOtvori.greska && (
        <Poruka vrsta="greska">
          {stanjePonovnoOtvori.greska}
        </Poruka>
      )}

      {stanjePonovnoOtvori.ok && (
        <Poruka vrsta="uspjeh">
          {stanjePonovnoOtvori.ok}
        </Poruka>
      )}

      {/* Entrega disponible para reclamar */}
      {status === "predano" && (
        <form
          action={akcijaPreuzmi}
          className="flex flex-wrap items-center gap-3"
        >
          <input
            type="hidden"
            name="locale"
            value={locale}
          />

          <Gumb disabled={saljePreuzmi}>
            {t("claim")}
          </Gumb>
        </form>
      )}

      {/* El usuario actual tiene la revisión */}
      {status === "u_pregledu" &&
        pregledavaTrenutniKorisnik && (
          <div className="space-y-3">
            <Poruka vrsta="uspjeh">
              {t("claimedByYou")}
            </Poruka>

            <form
              action={akcijaOtpusti}
              className="flex flex-wrap items-center gap-3"
            >
              <input
                type="hidden"
                name="locale"
                value={locale}
              />

              <Gumb disabled={saljeOtpusti}>
                {t("release")}
              </Gumb>
            </form>
          </div>
        )}

      {/* La revisión pertenece a otro usuario */}
      {status === "u_pregledu" &&
        !pregledavaTrenutniKorisnik && (
          <Poruka>
            {t("claimedByOther")}
          </Poruka>
        )}

      {/* Profesor: reabrir una entrega aceptada */}
      {status === "prihvaceno" &&
        jeNastavnik && (
          <form
            action={akcijaPonovnoOtvori}
            className="flex flex-wrap items-center gap-3"
          >
            <input
              type="hidden"
              name="locale"
              value={locale}
            />

            <Gumb disabled={saljePonovnoOtvori}>
              {saljePonovnoOtvori
                ? t("saving")
                : t("reopen")}
            </Gumb>
          </form>
        )}

      {/* Estados en los que no hay ninguna acción disponible */}
      {status !== "predano" &&
        status !== "u_pregledu" &&
        !(status === "prihvaceno" && jeNastavnik) && (
          <Poruka>
            {t("notAvailable")}
          </Poruka>
        )}

    </div>
  );
}