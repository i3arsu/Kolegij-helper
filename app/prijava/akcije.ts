"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prijavi } from "@/lib/auth/prijava";
import { kreirajSesiju } from "@/lib/auth/sesija";
import { ipKlijenta } from "@/lib/http/ip";

export type StanjePrijave = { greska?: string; email?: string };

export async function prijavaAkcija(_: StanjePrijave, forma: FormData): Promise<StanjePrijave> {
  const email = String(forma.get("email") ?? "");
  const lozinka = String(forma.get("lozinka") ?? "");
  const ip = await ipKlijenta();
  const rezultat = await prijavi(email, lozinka, ip);
  if (!rezultat.ok) return { greska: rezultat.poruka, email };

  await kreirajSesiju(rezultat.korisnikId, { ip, userAgent: (await headers()).get("user-agent") });
  redirect("/");
}
