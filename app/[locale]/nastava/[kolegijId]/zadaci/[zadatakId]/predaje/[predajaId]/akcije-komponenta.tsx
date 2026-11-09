
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

type AkcijePregledaProps = {
  kolegijId: string;
  zadatakId: string;
  predajaId: string;
  status: StatusPredaje;
  jeMojPregled: boolean;
  jeNastavnik: boolean;
  pregledavaIme: string | null;
  pregledavaPrezime: string | null;
};

export function AkcijePregleda({
  kolegijId,
  zadatakId,
  predajaId,
  status,
  jeMojPregled,
  jeNastavnik,
  pregledavaIme,
  pregledavaPrezime,
}: AkcijePregledaProps) {
  const t = useTranslations("teacherSubmissionReview");
  const locale = useLocale();

  // 1. Akcija preuzimanja pregleda.
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

  // 2. Akcija otpuštanja pregleda.
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

  // 3. Akcija ponovnog otvaranja predaje.
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

  // 4. Puno ime člana osoblja koji pregledava predaju.
  const imePregledavatelja = [
    pregledavaIme,
    pregledavaPrezime,
  ]
    .filter(
      (dio): dio is string => Boolean(dio?.trim()),
    )
    .join(" ");

  // 5. Određivanje treba li prikazati poruku
  // da trenutačno nema dostupnih radnji.
  const prikaziNedostupno =
    status !== "predano" &&
    status !== "u_pregledu" &&
    !(status === "prihvaceno" && jeNastavnik);

  return (
    <div className="space-y-3">
      {/* Rezultat preuzimanja pregleda */}
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

      {/* Rezultat otpuštanja pregleda */}
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

      {/* Rezultat ponovnog otvaranja predaje */}
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

      {/* Predaja je dostupna za pregled */}
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
            {saljePreuzmi
              ? t("saving")
              : t("claim")}
          </Gumb>
        </form>
      )}

      {/* Predaja je već preuzeta za pregled */}
      {status === "u_pregledu" && (
        <div className="space-y-3">
          {/* Informacija o vlasniku pregleda */}
          {jeMojPregled ? (
            <Poruka vrsta="uspjeh">
              {t("claimedByYou")}
            </Poruka>
          ) : (
            <Poruka>
              {t("claimedByOther")}

              {imePregledavatelja && (
                <>
                  {" "}
                  <strong>
                    {imePregledavatelja}
                  </strong>
                </>
              )}
            </Poruka>
          )}

          {/* Vlasnik pregleda ili nastavnik mogu otpustiti predaju */}
          {(jeMojPregled || jeNastavnik) && (
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
                {saljeOtpusti
                  ? t("saving")
                  : t("release")}
              </Gumb>
            </form>
          )}
        </div>
      )}

      {/* Nastavnik može ponovno otvoriti prihvaćenu predaju */}
      {status === "prihvaceno" && jeNastavnik && (
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

      {/* Nije dostupna nijedna radnja */}
      {prikaziNedostupno && (
        <Poruka>
          {t("notAvailable")}
        </Poruka>
      )}
    </div>
  );
}
