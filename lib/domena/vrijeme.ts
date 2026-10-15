
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { enGB, hr } from "date-fns/locale";

export const ZONA = "Europe/Zagreb";

type Jezik = "hr" | "en";

/** Lokalni datum (YYYY-MM-DD) i vrijeme (HH:mm) u Zagrebu kao apsolutni trenutak. */
export function lokalnoUTrenutak(datum: string, vrijeme: string): Date {
  const [g, m, d] = datum.split("-").map(Number);
  const [h, min] = vrijeme.split(":").map(Number);

  return new Date(
    new TZDate(g, m - 1, d, h, min, 0, ZONA).getTime()
  );
}

export function uZagrebu(trenutak: Date): TZDate {
  return new TZDate(trenutak.getTime(), ZONA);
}

export function formatDatum(t: Date, jezik: Jezik = "hr"): string {
  const datum = uZagrebu(t);

  return jezik === "en"
    ? format(datum, "d MMM yyyy", { locale: enGB })
    : format(datum, "d. M. yyyy.", { locale: hr });
}

export function formatDatumDan(
  t: Date,
  jezik: Jezik = "hr"
): string {
  const datum = uZagrebu(t);

  return jezik === "en"
    ? format(datum, "EEE, d MMM yyyy", { locale: enGB })
    : format(datum, "EEEEEE, d. M. yyyy.", { locale: hr });
}

export function formatVrijeme(t: Date): string {
  return format(uZagrebu(t), "HH:mm");
}

export function formatDatumVrijeme(
  t: Date,
  jezik: Jezik = "hr"
): string {
  return `${formatDatum(t, jezik)} ${formatVrijeme(t)}`;
}

/** Za <input type="date"> u zagrebačkoj zoni. */
export function isoDatum(t: Date): string {
  return format(uZagrebu(t), "yyyy-MM-dd");
}