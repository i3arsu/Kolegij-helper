import { lokalnoUTrenutak, ZONA } from "./vrijeme";
import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";

export type PonavljajuciUnos = {
  odDatuma: string; // YYYY-MM-DD
  doDatuma: string; // YYYY-MM-DD, uključivo
  danUTjednu: number; // 1 = ponedjeljak … 7 = nedjelja
  vrijemeOd: string; // HH:mm
  vrijemeDo: string; // HH:mm
};

export const MAX_TERMINA = 40;

/**
 * Tjedni termini između dva datuma. Lokalno vrijeme ostaje isto i preko prijelaza
 * na ljetno/zimsko računanje vremena (UTC pomak se mijenja).
 */
export function generirajPonavljajuce(u: PonavljajuciUnos): { pocetak: Date; kraj: Date }[] {
  if (u.vrijemeDo <= u.vrijemeOd) throw new Error("Kraj termina mora biti nakon početka.");
  if (u.doDatuma < u.odDatuma) throw new Error("Završni datum mora biti nakon početnog.");
  const [g, m, d] = u.odDatuma.split("-").map(Number);
  let dan = new TZDate(g, m - 1, d, 12, 0, 0, ZONA);
  const isoDan = (t: TZDate) => ((t.getDay() + 6) % 7) + 1;
  while (isoDan(dan) !== u.danUTjednu) dan = addDays(dan, 1);

  const rezultat: { pocetak: Date; kraj: Date }[] = [];
  while (format(dan, "yyyy-MM-dd") <= u.doDatuma) {
    const datum = format(dan, "yyyy-MM-dd");
    rezultat.push({ pocetak: lokalnoUTrenutak(datum, u.vrijemeOd), kraj: lokalnoUTrenutak(datum, u.vrijemeDo) });
    if (rezultat.length > MAX_TERMINA) throw new Error(`Najviše ${MAX_TERMINA} termina odjednom.`);
    dan = addDays(dan, 7);
  }
  return rezultat;
}
