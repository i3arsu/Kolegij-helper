import "server-only";
import { napraviBazu, type Baza } from "./klijent";
import { urlBaze } from "./url";

export { kaoKorisnik, type Baza, type Tx } from "./klijent";

const g = globalThis as unknown as { __bazaApp?: Baza; __bazaAuth?: Baza };

/** app_user: svi korisnički upiti, uvijek kroz kaoKorisnik(). */
export function bazaApp(): Baza {
  return (g.__bazaApp ??= napraviBazu(urlBaze("app_user")));
}

/** app_auth: samo prijava, sesije i promjena vlastite lozinke (lib/auth). */
export function bazaAuth(): Baza {
  return (g.__bazaAuth ??= napraviBazu(urlBaze("app_auth"), 5));
}
