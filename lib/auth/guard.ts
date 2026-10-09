import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { bazaApp, kaoKorisnik, type Tx } from "@/lib/db";
import { procitajSesiju } from "./sesija";

export type Profil = {
  korisnikId: string;
  email: string;
  jeAdmin: boolean;
  moraPromijenitiLozinku: boolean;
  osoblje: { id: string; ime: string; prezime: string; titula: string | null } | null;
  student: { id: string; jmbag: string; ime: string; prezime: string } | null;
};

export const dohvatiProfil = cache(async (): Promise<Profil | null> => {
  const sesija = await procitajSesiju();
  if (!sesija) return null;
  return kaoKorisnik(bazaApp(), sesija.korisnikId, async (tx) => {
    const osoblje = await tx
      .selectFrom("osoblje")
      .select(["id", "ime", "prezime", "titula"])
      .where("korisnik_id", "=", sesija.korisnikId)
      .executeTakeFirst();
    const student = await tx
      .selectFrom("student")
      .select(["id", "jmbag", "ime", "prezime"])
      .where("korisnik_id", "=", sesija.korisnikId)
      .executeTakeFirst();
    return {
      korisnikId: sesija.korisnikId,
      email: sesija.email,
      jeAdmin: sesija.jeAdmin,
      moraPromijenitiLozinku: sesija.moraPromijenitiLozinku,
      osoblje: osoblje ?? null,
      student: student ?? null,
    };
  });
});

/** Prijavljeni korisnik ili preusmjeravanje na prijavu / obaveznu promjenu lozinke. */
export async function zahtijevajProfil(opcije: { dopustiPromjenuLozinke?: boolean } = {}): Promise<Profil> {
  const profil = await dohvatiProfil();
  if (!profil) redirect("/prijava");
  if (profil.moraPromijenitiLozinku && !opcije.dopustiPromjenuLozinke) redirect("/promjena-lozinke");
  return profil;
}

/** Izvršava upit kao prijavljeni korisnik (RLS kontekst). */
export async function upit<T>(fn: (tx: Tx, profil: Profil) => Promise<T>): Promise<T> {
  const profil = await zahtijevajProfil();
  return kaoKorisnik(bazaApp(), profil.korisnikId, (tx) => fn(tx, profil));
}

export type UlogaNaKolegiju = "nastavnik" | "asistent" | "student";

export const ulogaNaKolegiju = cache(async (kolegijId: string): Promise<UlogaNaKolegiju | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(kolegijId)) return null;
  return upit(async (tx, profil) => {
    if (profil.osoblje) {
      const ok = await tx
        .selectFrom("osoblje_kolegija")
        .select("uloga")
        .where("kolegij_id", "=", kolegijId)
        .where("osoblje_id", "=", profil.osoblje.id)
        .executeTakeFirst();
      if (ok) return ok.uloga as UlogaNaKolegiju;
    }
    if (profil.student) {
      const upis = await tx
        .selectFrom("upis")
        .select("id")
        .where("kolegij_id", "=", kolegijId)
        .where("student_id", "=", profil.student.id)
        .where("status", "=", "aktivan")
        .executeTakeFirst();
      if (upis) return "student";
    }
    return null;
  });
});

/** Osoblje kolegija (nastavnik ili asistent), inače 404. */
export async function zahtijevajOsoblje(kolegijId: string): Promise<"nastavnik" | "asistent"> {
  const uloga = await ulogaNaKolegiju(kolegijId);
  if (uloga !== "nastavnik" && uloga !== "asistent") notFound();
  return uloga;
}

export async function zahtijevajNastavnika(kolegijId: string): Promise<void> {
  if ((await ulogaNaKolegiju(kolegijId)) !== "nastavnik") notFound();
}

export async function zahtijevajStudenta(kolegijId: string): Promise<void> {
  if ((await ulogaNaKolegiju(kolegijId)) !== "student") notFound();
}
