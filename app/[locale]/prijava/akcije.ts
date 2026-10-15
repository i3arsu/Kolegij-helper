
"use server";

import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";
import { prijavi } from "@/lib/auth/prijava";
import { kreirajSesiju } from "@/lib/auth/sesija";
import { ipKlijenta } from "@/lib/http/ip";

export type StanjePrijave = {
  greska?: string;
  email?: string;
};

export async function prijavaAkcija(
  _: StanjePrijave,
  forma: FormData
) {
  const trazeniLocale = String(forma.get("locale") ?? "");

  const locale =
    routing.locales.find(
      (podrzaniLocale) => podrzaniLocale === trazeniLocale
    ) ?? routing.defaultLocale;

  const t = await getTranslations({
    locale,
    namespace: "login",
  });

  const email = String(forma.get("email") ?? "");
  const lozinka = String(forma.get("lozinka") ?? "");

  try {
    const ip = await ipKlijenta();

    const rezultat = await prijavi(email, lozinka, ip);

    if (!rezultat.ok) {
      return {
        greska:
          rezultat.razlog === "zakljucano"
            ? t("locked")
            : t("invalidCredentials"),
        email,
      };
    }

    await kreirajSesiju(rezultat.korisnikId, {
      ip,
      userAgent: (await headers()).get("user-agent"),
    });
  } catch (error) {
    console.error("[login] Error durante la autenticación:", error);

    return {
      greska: t("unexpectedError"),
      email,
    };
  }
  
  redirect(
    locale === routing.defaultLocale ? "/" : `/${locale}`
  );
}