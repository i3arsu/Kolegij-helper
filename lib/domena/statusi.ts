
import type { StatusPredaje } from "@/lib/db/tipovi";

type TonStatusa =
  | "neutralno"
  | "uspjeh"
  | "upozorenje"
  | "greska";

/**
 * Ton vizualne oznake za svaki status predaje.
 */
export const TON_STATUSA = {
  nije_predano: "neutralno",
  predano: "neutralno",
  u_pregledu: "upozorenje",
  vraceno_na_doradu: "upozorenje",
  prihvaceno: "uspjeh",
} as const satisfies Record<StatusPredaje, TonStatusa>;

/**
 * Ključ prijevoda za svaki status predaje.
 */
export const KLJUC_STATUSA = {
  nije_predano: "statuses.nije_predano",
  predano: "statuses.predano",
  u_pregledu: "statuses.u_pregledu",
  vraceno_na_doradu: "statuses.vraceno_na_doradu",
  prihvaceno: "statuses.prihvaceno",
} as const satisfies Record<
  StatusPredaje,
  `statuses.${StatusPredaje}`
>;

/**
 * Određuje može li student predati ili zamijeniti predaju.
 */
export function mozeStudentPredati(
  status: StatusPredaje | null,
): boolean {
  switch (status) {
    case "nije_predano":
    case "predano":
    case "vraceno_na_doradu":
      return true;

    case "u_pregledu":
    case "prihvaceno":
    case null:
      return false;
  }
}