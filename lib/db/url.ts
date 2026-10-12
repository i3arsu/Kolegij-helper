// Gradi URL-ove baze iz dijelova u .env, tako da je svaka lozinka zapisana samo jednom.
// Ako je URL izričito postavljen (npr. OWNER_DATABASE_URL), koristi se on.

export type UlogaBaze = "app_owner" | "app_user" | "app_auth";

const VARIJABLE: Record<UlogaBaze, { url: string; lozinka: string }> = {
  app_owner: { url: "OWNER_DATABASE_URL", lozinka: "APP_OWNER_PASS" },
  app_user: { url: "DATABASE_URL", lozinka: "APP_USER_PASS" },
  app_auth: { url: "AUTH_DATABASE_URL", lozinka: "APP_AUTH_PASS" },
};

export function urlBaze(uloga: UlogaBaze, env: NodeJS.ProcessEnv = process.env): string {
  const v = VARIJABLE[uloga];
  const izricit = env[v.url];
  if (izricit) return izricit;
  const lozinka = env[v.lozinka];
  if (!lozinka) throw new Error(`Nedostaje ${v.lozinka} u .env (ili izričit ${v.url}).`);
  const host = env.DB_HOST || "127.0.0.1";
  const port = env.DB_PORT || "5433";
  const baza = env.DB_NAME || "pracenje";
  // encodeURIComponent: znakovi poput @ : / # u lozinki ne kvare URL
  return `postgres://${uloga}:${encodeURIComponent(lozinka)}@${host}:${port}/${baza}?sslmode=disable`;
}
