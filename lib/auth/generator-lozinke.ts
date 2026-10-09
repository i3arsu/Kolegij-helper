import { randomInt } from "node:crypto";

// Mala slova i znamenke bez dvosmislenih znakova (0/o, 1/l/i): 31 znak.
// 12 znakova ≈ 59 bita entropije. Format xxxx-xxxx-xxxx lako se prepisuje s listića.
const ABECEDA = "abcdefghjkmnpqrstuvwxyz23456789";

export function generirajLozinku(): string {
  const znakovi = Array.from({ length: 12 }, () => ABECEDA[randomInt(ABECEDA.length)]);
  return [znakovi.slice(0, 4), znakovi.slice(4, 8), znakovi.slice(8)].map((d) => d.join("")).join("-");
}

export const ABECEDA_LOZINKE = ABECEDA;
