import { randomBytes } from "node:crypto";
import { inject } from "vitest";
import pg from "pg";
import { sql } from "kysely";
import { kaoKorisnik, napraviBazu, type Baza, type Tx } from "@/lib/db/klijent";

const LOZINKE = { app_owner: "owner-test", app_user: "user-test", app_auth: "auth-test" };

export type Okruzenje = {
  vlasnik: Baza; // app_owner: postavljanje scene (zaobilazi RLS kao vlasnik tablica)
  app: Baza; // app_user: ono što koristi aplikacija
  kao: <T>(korisnikId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;
  bezKonteksta: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  zatvori: () => Promise<void>;
};

/** Nova baza iz migriranog predloška, izolirana za jednu test datoteku. */
export async function novoOkruzenje(): Promise<Okruzenje> {
  const ime = `t_${randomBytes(6).toString("hex")}`;
  const superKlijent = new pg.Client({ connectionString: inject("pgSuperUrl") });
  await superKlijent.connect();
  await superKlijent.query(`create database ${ime} template predlozak owner app_owner`);
  await superKlijent.end();

  const url = (uloga: keyof typeof LOZINKE) =>
    `postgres://${uloga}:${LOZINKE[uloga]}@${inject("pgHost")}:${inject("pgPort")}/${ime}`;
  const vlasnik = napraviBazu(url("app_owner"), 2);
  const app = napraviBazu(url("app_user"), 4);
  return {
    vlasnik,
    app,
    kao: (korisnikId, fn) => kaoKorisnik(app, korisnikId, fn),
    bezKonteksta: (fn) => app.transaction().execute(fn),
    zatvori: async () => {
      await vlasnik.destroy();
      await app.destroy();
    },
  };
}

/** Očekuje da upit padne (RLS ili prava); vraća SQLSTATE kod. */
export async function greskaKod(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code ?? "nepoznato";
  }
  throw new Error("Očekivana je greška, ali upit je uspio");
}

export { sql };
