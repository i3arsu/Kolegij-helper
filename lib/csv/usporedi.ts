import type { RedUvoza } from "./validiraj";

export type PostojeciStudent = {
  jmbag: string;
  ime: string;
  prezime: string;
  email: string;
  upis_status: "aktivan" | "ispisan" | null; // null = postoji račun, ali nije upisan na ovaj kolegij
  grupa_p: string | null;
  grupa_v: string | null;
};
export type PostojeciEmail = { email: string; jmbag: string | null }; // jmbag null = e-mail pripada osoblju

// Ključeve polja i vlasnika e-maila prevodi sučelje (import.fields, import.conflict*).
export type PoljeIzmjene = "ime" | "prezime" | "email" | "grupa_p" | "grupa_v";
export type Izmjena = { polje: PoljeIzmjene; staro: string | null; novo: string | null };

export type StavkaPregleda =
  | { vrsta: "novi"; red: RedUvoza }
  | { vrsta: "upis_postojeceg"; red: RedUvoza; izmjene: Izmjena[] }
  | { vrsta: "izmijenjen"; red: RedUvoza; izmjene: Izmjena[]; promjenaGrupe: boolean; ponovniUpis: boolean }
  | { vrsta: "nepromijenjen"; red: RedUvoza }
  | { vrsta: "konflikt"; red: RedUvoza; emailKoristi: { jmbag: string } | "osoblje" };

export type PregledUvoza = {
  stavke: StavkaPregleda[];
  nisuUDatoteci: { jmbag: string; ime: string; prezime: string }[];
};

export function usporedi(
  redovi: RedUvoza[],
  postojeci: PostojeciStudent[],
  emailovi: PostojeciEmail[],
  upisaniNaKolegij: { jmbag: string; ime: string; prezime: string }[],
): PregledUvoza {
  const poJmbagu = new Map(postojeci.map((s) => [s.jmbag, s]));
  const vlasnikEmaila = new Map(emailovi.map((e) => [e.email.toLowerCase(), e.jmbag]));

  const stavke = redovi.map((red): StavkaPregleda => {
    const vlasnik = vlasnikEmaila.get(red.email);
    if (vlasnik !== undefined && vlasnik !== red.jmbag) {
      return {
        vrsta: "konflikt",
        red,
        emailKoristi: vlasnik ? { jmbag: vlasnik } : "osoblje",
      };
    }
    const s = poJmbagu.get(red.jmbag);
    if (!s) return { vrsta: "novi", red };

    const izmjene: Izmjena[] = [];
    for (const polje of ["ime", "prezime", "email"] as const) {
      if (s[polje] !== red[polje]) izmjene.push({ polje, staro: s[polje], novo: red[polje] });
    }
    let promjenaGrupe = false;
    for (const polje of ["grupa_p", "grupa_v"] as const) {
      // Prazna grupa u datoteci ne mijenja postojeće članstvo.
      if (red[polje] && s.upis_status && s[polje] !== red[polje]) {
        izmjene.push({ polje, staro: s[polje], novo: red[polje] });
        if (s[polje]) promjenaGrupe = true;
      }
    }
    if (s.upis_status === null) return { vrsta: "upis_postojeceg", red, izmjene };
    const ponovniUpis = s.upis_status === "ispisan";
    if (izmjene.length === 0 && !ponovniUpis) return { vrsta: "nepromijenjen", red };
    return { vrsta: "izmijenjen", red, izmjene, promjenaGrupe, ponovniUpis };
  });

  const uDatoteci = new Set(redovi.map((r) => r.jmbag));
  return { stavke, nisuUDatoteci: upisaniNaKolegij.filter((s) => !uDatoteci.has(s.jmbag)) };
}
