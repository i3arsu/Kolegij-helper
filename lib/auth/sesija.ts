import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { sql } from "kysely";
import { bazaAuth } from "@/lib/db";

export const KOLACIC_SESIJE = "sesija";
const TRAJANJE_MS = 14 * 24 * 60 * 60 * 1000;
const PRODULJI_KAD_OSTANE_MS = 7 * 24 * 60 * 60 * 1000;

export type Sesija = {
  korisnikId: string;
  email: string;
  moraPromijenitiLozinku: boolean;
  jeAdmin: boolean;
  sesijaId: string;
};

function hashTokena(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sigurniKolacic(): boolean {
  return (process.env.APP_URL ?? "").startsWith("https://");
}

export function opcijeKolacica(maxAgeSekundi: number) {
  return {
    httpOnly: true,
    secure: sigurniKolacic(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSekundi,
  };
}

/** Kreira novu sesiju i postavlja kolačić. Smije se zvati samo iz Server Actiona / Route Handlera. */
export async function kreirajSesiju(korisnikId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = randomBytes(32).toString("base64url");
  await bazaAuth()
    .insertInto("sesija")
    .values({
      id: hashTokena(token),
      korisnik_id: korisnikId,
      istjece: new Date(Date.now() + TRAJANJE_MS),
      ip: meta.ip ?? null,
      user_agent: meta.userAgent?.slice(0, 300) ?? null,
    })
    .execute();
  (await cookies()).set(KOLACIC_SESIJE, token, opcijeKolacica(TRAJANJE_MS / 1000));
}

/** Čita i provjerava sesiju iz kolačića. Jednom po zahtjevu (React cache). */
export const procitajSesiju = cache(async (): Promise<Sesija | null> => {
  const token = (await cookies()).get(KOLACIC_SESIJE)?.value;
  if (!token) return null;
  const id = hashTokena(token);
  const red = await bazaAuth()
    .selectFrom("sesija as s")
    .innerJoin("korisnik as k", "k.id", "s.korisnik_id")
    .select(["s.id", "s.istjece", "k.id as korisnik_id", "k.email", "k.mora_promijeniti_lozinku", "k.je_admin"])
    .where("s.id", "=", id)
    .where("s.istjece", ">", sql<Date>`now()`)
    .where("k.aktivan", "=", true)
    .executeTakeFirst();
  if (!red) return null;

  // Klizno trajanje: produlji u bazi kad ostane manje od 7 dana (kolačić osvježava proxy.ts).
  if (red.istjece.getTime() - Date.now() < PRODULJI_KAD_OSTANE_MS) {
    await bazaAuth()
      .updateTable("sesija")
      .set({ istjece: new Date(Date.now() + TRAJANJE_MS) })
      .where("id", "=", id)
      .execute();
  }
  return {
    korisnikId: red.korisnik_id,
    email: red.email,
    moraPromijenitiLozinku: red.mora_promijeniti_lozinku,
    jeAdmin: red.je_admin,
    sesijaId: red.id,
  };
});

export async function obrisiSesiju() {
  const jar = await cookies();
  const token = jar.get(KOLACIC_SESIJE)?.value;
  if (token) await bazaAuth().deleteFrom("sesija").where("id", "=", hashTokena(token)).execute();
  jar.delete(KOLACIC_SESIJE);
}

export async function obrisiOstaleSesije(korisnikId: string, osimSesije: string) {
  await bazaAuth()
    .deleteFrom("sesija")
    .where("korisnik_id", "=", korisnikId)
    .where("id", "<>", osimSesije)
    .execute();
}
