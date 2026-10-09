import "server-only";
import { napraviBazu, type Baza } from "./klijent";

export { kaoKorisnik, type Baza, type Tx } from "./klijent";

const g = globalThis as unknown as { __bazaApp?: Baza; __bazaAuth?: Baza };

function obavezno(ime: string): string {
  const v = process.env[ime];
  if (!v) throw new Error(`Nedostaje varijabla okruženja ${ime}`);
  return v;
}

/** app_user: svi korisnički upiti, uvijek kroz kaoKorisnik(). */
export function bazaApp(): Baza {
  return (g.__bazaApp ??= napraviBazu(obavezno("DATABASE_URL")));
}

/** app_auth: samo prijava, sesije i promjena vlastite lozinke (lib/auth). */
export function bazaAuth(): Baza {
  return (g.__bazaAuth ??= napraviBazu(obavezno("AUTH_DATABASE_URL"), 5));
}
