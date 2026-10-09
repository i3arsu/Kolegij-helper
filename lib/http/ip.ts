import "server-only";
import { isIP } from "node:net";
import { headers } from "next/headers";

/** IP klijenta iza reverse proxyja (Caddy postavlja X-Forwarded-For). */
export async function ipKlijenta(): Promise<string | null> {
  const h = await headers();
  const kandidat = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  return isIP(kandidat) ? kandidat : null;
}
