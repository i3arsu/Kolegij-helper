import { hash, verify } from "@node-rs/argon2";

// Argon2id (zadano u @node-rs/argon2), parametri prema OWASP preporuci.
const OPCIJE = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashLozinke(lozinka: string): Promise<string> {
  return hash(lozinka, OPCIJE);
}

export async function provjeriLozinku(hashirana: string, lozinka: string): Promise<boolean> {
  try {
    return await verify(hashirana, lozinka);
  } catch {
    return false;
  }
}

let lazniHash: Promise<string> | undefined;

/** Za nepoznat e-mail svejedno radimo verifikaciju da vrijeme odgovora ne otkriva postoji li račun. */
export async function laznaProvjera(lozinka: string): Promise<void> {
  lazniHash ??= hashLozinke("lazna-lozinka-za-konstantno-vrijeme");
  await provjeriLozinku(await lazniHash, lozinka);
}

export const MIN_DULJINA_LOZINKE = 10;

/** Vraća poruku greške ili null ako je nova lozinka prihvatljiva. */
export function provjeriNovuLozinku(lozinka: string, korisnik: { email: string; jmbag?: string | null }): string | null {
  if (lozinka.length < MIN_DULJINA_LOZINKE) return `Lozinka mora imati najmanje ${MIN_DULJINA_LOZINKE} znakova.`;
  if (lozinka.length > 200) return "Lozinka je predugačka.";
  const mala = lozinka.toLowerCase();
  if (mala === korisnik.email.toLowerCase() || mala === korisnik.email.split("@")[0].toLowerCase()) {
    return "Lozinka ne smije biti jednaka e-mail adresi.";
  }
  if (korisnik.jmbag && lozinka.includes(korisnik.jmbag)) return "Lozinka ne smije sadržavati JMBAG.";
  return null;
}
