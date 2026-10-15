
"use server";

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";
import { zahtijevajProfil } from "@/lib/auth/guard";
import { promijeniLozinku } from "@/lib/auth/prijava";
import {
  obrisiOstaleSesije,
  procitajSesiju,
} from "@/lib/auth/sesija";
import { MIN_DULJINA_LOZINKE } from "@/lib/auth/lozinka";

export type StanjePromjene = {
  greska?: string;
};

export async function promjenaLozinkeAkcija(
  _: StanjePromjene,
  forma: FormData
): Promise<StanjePromjene> {
  // Identificar y validar el idioma seleccionado.
  const trazeniLocale = String(forma.get("locale") ?? "");

  const locale =
    routing.locales.find(
      (podrzaniLocale) => podrzaniLocale === trazeniLocale
    ) ?? routing.defaultLocale;

  // Cargar las traducciones del cambio de contraseña.
  const t = await getTranslations({
    locale,
    namespace: "passwordChange",
  });

  const profil = await zahtijevajProfil({
    dopustiPromjenuLozinke: true,
  });

  const sesija = await procitajSesiju();

  const stara = String(forma.get("stara") ?? "");
  const nova = String(forma.get("nova") ?? "");
  const potvrda = String(forma.get("potvrda") ?? "");

  if (nova !== potvrda) {
    return { greska: t("mismatch") };
  }

  const r = await promijeniLozinku(
    profil.korisnikId,
    stara,
    nova,
    profil.student?.jmbag ?? null
  );

  if (!r.ok) {
    switch (r.razlog) {
      case "trenutnaNeispravna":
        return { greska: t("currentPasswordIncorrect") };

      case "istaKaoTrenutna":
        return { greska: t("samePassword") };

      case "prekratka":
        return {
          greska: t("tooShort", {
            min: MIN_DULJINA_LOZINKE,
          }),
        };

      case "preduga":
        return { greska: t("tooLong") };

      case "email":
        return { greska: t("emailNotAllowed") };

      case "jmbag":
        return { greska: t("studentIdNotAllowed") };
    }
  }

  if (sesija) {
    await obrisiOstaleSesije(
      profil.korisnikId,
      sesija.sesijaId
    );
  }

  // Conservar el idioma después del cambio de contraseña.
  redirect(
    locale === routing.defaultLocale ? "/" : `/${locale}`
  );
}