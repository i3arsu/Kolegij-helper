import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { hr } from "date-fns/locale";

export const ZONA = "Europe/Zagreb";

/** Lokalni datum (YYYY-MM-DD) i vrijeme (HH:mm) u Zagrebu kao apsolutni trenutak. */
export function lokalnoUTrenutak(datum: string, vrijeme: string): Date {
  const [g, m, d] = datum.split("-").map(Number);
  const [h, min] = vrijeme.split(":").map(Number);
  return new Date(new TZDate(g, m - 1, d, h, min, 0, ZONA).getTime());
}

export function uZagrebu(trenutak: Date): TZDate {
  return new TZDate(trenutak.getTime(), ZONA);
}

export function formatDatum(t: Date): string {
  return format(uZagrebu(t), "d. M. yyyy.", { locale: hr });
}

export function formatDatumDan(t: Date): string {
  return format(uZagrebu(t), "EEEEEE, d. M. yyyy.", { locale: hr });
}

export function formatVrijeme(t: Date): string {
  return format(uZagrebu(t), "HH:mm");
}

export function formatDatumVrijeme(t: Date): string {
  return `${formatDatum(t)} ${formatVrijeme(t)}`;
}

/** Za <input type="date"> u zagrebačkoj zoni. */
export function isoDatum(t: Date): string {
  return format(uZagrebu(t), "yyyy-MM-dd");
}
