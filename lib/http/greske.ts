// Pretvara greške baze i servisa u poruke za korisnika na jeziku sučelja (namespace "errors" u messages/*.json).

import type { Prevoditelj } from "@/lib/i18n/prevoditelj";

/** Prevoditelj za namespace "errors" (getTranslations / useTranslations / createTranslator). */
export type PrevoditeljGresaka = Prevoditelj;

/** Greška servisa s ključem poruke; prevodi se tek pri prikazu (porukaGreske). */
export class GreskaAplikacije extends Error {
  constructor(
    readonly kljuc: string,
    readonly vrijednosti?: Record<string, string | number>,
  ) {
    super(`errors.${kljuc}`);
  }
}

// Poruke iz baze (P0001, db/migrations) su na hrvatskom; prepoznaju se po tekstu i prevode.
// Za svaku novu P0001 poruku dodajte uzorak ovdje i ključ u errors.db (test to provjerava).
const PORUKE_BAZE: [RegExp, string][] = [
  [/^Student nije upisan na kolegij$/, "db.studentNotEnrolled"],
  [/^Student nije član grupe u vrijeme termina$/, "db.studentNotInGroup"],
  [/^Grupa ne pripada kolegiju upisa$/, "db.groupNotInEnrollmentCourse"],
  [/^Grupa ne pripada kolegiju$/, "db.groupNotInCourse"],
  [/^Datum promjene mora biti nakon početka trenutnog članstva$/, "db.changeDateTooEarly"],
  [/^Neispravan JMBAG: (.*)$/, "db.invalidJmbag"],
  [/^E-mail (.*) već koristi drugi korisnik$/, "db.emailTaken"],
  [/^Nepoznata grupa: (.*)$/, "db.unknownGroup"],
];

export function porukaBaze(t: PrevoditeljGresaka, poruka: string | undefined): string {
  if (!poruka) return t("generic");
  for (const [uzorak, kljuc] of PORUKE_BAZE) {
    const m = uzorak.exec(poruka);
    if (m) return t(kljuc, m[1] === undefined ? undefined : { value: m[1] });
  }
  return poruka;
}

export function porukaGreske(e: unknown, t: PrevoditeljGresaka): string {
  if (e instanceof GreskaAplikacije) return t(e.kljuc, e.vrijednosti);
  const g = e as { code?: string; message?: string; constraint?: string };
  switch (g?.code) {
    case "P0001":
      return porukaBaze(t, g.message);
    case "42501":
      return t("forbidden");
    case "23505":
      return t("duplicate");
    case "23P01":
      return g.constraint === "clanstvo_bez_preklapanja" ? t("twoGroups") : t("overlap");
    case "23514":
      return t("invalidData");
  }
  if (g?.message && !g.code) return g.message;
  console.error(e);
  return t("tryAgain");
}
