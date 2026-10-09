"use server";

import { redirect } from "next/navigation";
import { zahtijevajProfil } from "@/lib/auth/guard";
import { promijeniLozinku } from "@/lib/auth/prijava";
import { obrisiOstaleSesije, procitajSesiju } from "@/lib/auth/sesija";

export type StanjePromjene = { greska?: string };

export async function promjenaLozinkeAkcija(_: StanjePromjene, forma: FormData): Promise<StanjePromjene> {
  const profil = await zahtijevajProfil({ dopustiPromjenuLozinke: true });
  const sesija = await procitajSesiju();
  const stara = String(forma.get("stara") ?? "");
  const nova = String(forma.get("nova") ?? "");
  if (nova !== String(forma.get("potvrda") ?? "")) return { greska: "Nova lozinka i potvrda se ne podudaraju." };

  const r = await promijeniLozinku(profil.korisnikId, stara, nova, profil.student?.jmbag ?? null);
  if (!r.ok) return { greska: r.poruka };
  if (sesija) await obrisiOstaleSesije(profil.korisnikId, sesija.sesijaId);
  redirect("/");
}
