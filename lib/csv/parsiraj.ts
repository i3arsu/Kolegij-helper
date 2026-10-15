import Papa from "papaparse";

export type PoljeUvoza = "jmbag" | "ime" | "prezime" | "email" | "grupa_p" | "grupa_v";

// Zaglavlja se normaliziraju (mala slova, bez dijakritika, razmaka i interpunkcije) pa uspoređuju s aliasima.
const ALIASI: Record<PoljeUvoza, string[]> = {
  jmbag: ["jmbag", "maticnibroj", "maticni", "studentid", "studentidnumber"],
  ime: ["ime", "firstname"],
  prezime: ["prezime", "lastname", "surname"],
  email: ["email", "mail", "eposta", "emailadresa", "adresaeposte", "emailaddress"],
  grupa_p: ["grupap", "grupapredavanja", "predavanja", "predavanje", "p", "lecturegroup", "lecture"],
  grupa_v: ["grupav", "grupavjezbi", "grupavjezbe", "vjezbe", "v", "grupa", "exercisegroup", "exercises", "labgroup", "group"],
};
export const OBAVEZNA_POLJA: PoljeUvoza[] = ["jmbag", "ime", "prezime", "email"];

export type SiroviRed = { redak: number } & Partial<Record<PoljeUvoza, string>>;

export type RezultatParsiranja = {
  redovi: SiroviRed[];
  mapiranje: Partial<Record<PoljeUvoza, string>>; // polje -> izvorno zaglavlje
  nepoznatiStupci: string[];
  nedostajuciStupci: PoljeUvoza[];
  separator: string;
  kodiranje: "utf-8" | "windows-1250";
};

export function normalizirajZaglavlje(h: string): string {
  return h
    .toLowerCase()
    .replaceAll("đ", "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** UTF-8 (s ili bez BOM-a); ako nije valjan UTF-8, Windows-1250 (Excel/ISVU izvozi na hrvatskom). */
export function dekodiraj(bajtovi: Uint8Array): { tekst: string; kodiranje: "utf-8" | "windows-1250" } {
  try {
    const tekst = new TextDecoder("utf-8", { fatal: true }).decode(bajtovi);
    return { tekst: tekst.replace(/^﻿/, ""), kodiranje: "utf-8" };
  } catch {
    return { tekst: new TextDecoder("windows-1250").decode(bajtovi), kodiranje: "windows-1250" };
  }
}

export function parsirajCsv(bajtovi: Uint8Array): RezultatParsiranja {
  const { tekst, kodiranje } = dekodiraj(bajtovi);
  const rez = Papa.parse<string[]>(tekst, {
    delimitersToGuess: [";", ",", "\t"],
    skipEmptyLines: "greedy",
  });
  const [zaglavlje = [], ...podaci] = rez.data;

  const mapiranje: Partial<Record<PoljeUvoza, string>> = {};
  const indeksi: Partial<Record<PoljeUvoza, number>> = {};
  const nepoznatiStupci: string[] = [];
  zaglavlje.forEach((h, i) => {
    const n = normalizirajZaglavlje(h);
    const polje = (Object.keys(ALIASI) as PoljeUvoza[]).find((p) => ALIASI[p].includes(n) && indeksi[p] === undefined);
    if (polje) {
      indeksi[polje] = i;
      mapiranje[polje] = h;
    } else if (h.trim()) {
      nepoznatiStupci.push(h);
    }
  });

  const redovi = podaci.map((stupci, i) => {
    const red: SiroviRed = { redak: i + 2 }; // +1 zaglavlje, +1 jer retci kreću od 1
    for (const [polje, idx] of Object.entries(indeksi) as [PoljeUvoza, number][]) {
      red[polje] = (stupci[idx] ?? "").trim();
    }
    return red;
  });

  return {
    redovi,
    mapiranje,
    nepoznatiStupci,
    nedostajuciStupci: OBAVEZNA_POLJA.filter((p) => indeksi[p] === undefined),
    separator: rez.meta.delimiter,
    kodiranje,
  };
}
