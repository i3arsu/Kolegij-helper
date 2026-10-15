import { hasLocale } from "next-intl";
import { routing } from "./routing";

// Server Actions dobivaju jezik iz skrivenog polja "locale" u formi ili kao vezani argument.
export function jezikIz(vrijednost: unknown) {
  return hasLocale(routing.locales, vrijednost) ? vrijednost : routing.defaultLocale;
}

export function jezikObrasca(forma: FormData) {
  return jezikIz(forma.get("locale"));
}

/** Prefiks putanje za jezik ("" za zadani hrvatski, "/en" za engleski). */
export function prefiksJezika(locale: string) {
  return locale === routing.defaultLocale ? "" : `/${locale}`;
}
