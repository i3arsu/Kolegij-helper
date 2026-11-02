import type { StatusPredaje } from "@/lib/db/tipovi";

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