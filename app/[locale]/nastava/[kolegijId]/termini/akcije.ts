"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { upit, zahtijevajOsoblje } from "@/lib/auth/guard";
import { generirajPonavljajuce } from "@/lib/domena/termini";
import { lokalnoUTrenutak } from "@/lib/domena/vrijeme";
import { porukaGreske } from "@/lib/http/greske";
import { dodajGosta, kreirajTermine, obrisiTermin, postaviOtkazan, spremiEvidenciju, type StatusDolaska } from "@/lib/servisi/termini";

export type Stanje = { greska?: string; ok?: string };

const vrijeme = z.string().regex(/^\d{2}:\d{2}$/, "Neispravno vrijeme");
const shemaTermina = z.discriminatedUnion("nacin", [
  z.object({
    nacin: z.literal("jednom"),
    grupa_id: z.uuid("Odaberite grupu"),
    datum: z.iso.date("Odaberite datum"),
    od: vrijeme,
    do: vrijeme,
    tema: z.string().trim().max(200).optional(),
  }),
  z.object({
    nacin: z.literal("tjedno"),
    grupa_id: z.uuid("Odaberite grupu"),
    od_datuma: z.iso.date("Odaberite početni datum"),
    do_datuma: z.iso.date("Odaberite završni datum"),
    dan: z.coerce.number().int().min(1).max(7),
    od: vrijeme,
    do: vrijeme,
    tema: z.string().trim().max(200).optional(),
  }),
]);

export async function noviTerminAkcija(kolegijId: string, _: Stanje, forma: FormData): Promise<Stanje> {
  await zahtijevajOsoblje(kolegijId);
  const p = shemaTermina.safeParse(Object.fromEntries(forma));
  if (!p.success) return { greska: p.error.issues[0].message };
  const d = p.data;
  try {
    if (d.od >= d.do) throw new Error("Kraj termina mora biti nakon početka.");
    const termini =
      d.nacin === "jednom"
        ? [{ pocetak: lokalnoUTrenutak(d.datum, d.od), kraj: lokalnoUTrenutak(d.datum, d.do) }]
        : generirajPonavljajuce({ odDatuma: d.od_datuma, doDatuma: d.do_datuma, danUTjednu: d.dan, vrijemeOd: d.od, vrijemeDo: d.do });
    if (termini.length === 0) throw new Error("U odabranom razdoblju nema tog dana u tjednu.");
    await upit((tx) => kreirajTermine(tx, kolegijId, d.grupa_id, termini, d.tema || null));
  } catch (e) {
    return { greska: porukaGreske(e) };
  }
  revalidatePath(`/nastava/${kolegijId}`, "layout");
  redirect(`/nastava/${kolegijId}/termini`);
}

const STATUSI = ["prisutan", "odsutan", "opravdano"] as const;

export async function evidencijaAkcija(kolegijId: string, terminId: string, _: Stanje, forma: FormData): Promise<Stanje> {
  await zahtijevajOsoblje(kolegijId);
  const stavke: { studentId: string; status: StatusDolaska; napomena: string | null; gost: boolean }[] = [];
  for (const [kljuc, vrijednost] of forma) {
    const m = /^status:([0-9a-f-]{36})$/.exec(kljuc);
    if (!m) continue;
    if (!STATUSI.includes(vrijednost as StatusDolaska)) return { greska: "Neispravan status." };
    stavke.push({
      studentId: m[1],
      status: vrijednost as StatusDolaska,
      napomena: String(forma.get(`napomena:${m[1]}`) ?? "").trim() || null,
      gost: forma.get(`gost:${m[1]}`) === "1",
    });
  }
  try {
    await upit((tx) => spremiEvidenciju(tx, z.uuid().parse(terminId), stavke));
  } catch (e) {
    return { greska: porukaGreske(e) };
  }
  revalidatePath(`/nastava/${kolegijId}`, "layout");
  return { ok: `Evidencija spremljena (${stavke.length} studenata).` };
}

export async function gostAkcija(kolegijId: string, terminId: string, _: Stanje, forma: FormData): Promise<Stanje> {
  await zahtijevajOsoblje(kolegijId);
  const jmbag = String(forma.get("jmbag") ?? "").replace(/\s/g, "");
  if (!/^\d{10}$/.test(jmbag)) return { greska: "Unesite ispravan JMBAG." };
  try {
    await upit((tx) => dodajGosta(tx, z.uuid().parse(terminId), jmbag));
  } catch (e) {
    return { greska: porukaGreske(e) };
  }
  revalidatePath(`/nastava/${kolegijId}/termini/${terminId}`);
  return { ok: "Gost dodan." };
}

export async function otkaziAkcija(kolegijId: string, terminId: string, otkazan: boolean) {
  await zahtijevajOsoblje(kolegijId);
  await upit((tx) => postaviOtkazan(tx, z.uuid().parse(terminId), otkazan));
  revalidatePath(`/nastava/${kolegijId}`, "layout");
}

export async function obrisiAkcija(kolegijId: string, terminId: string): Promise<Stanje> {
  await zahtijevajOsoblje(kolegijId);
  try {
    await upit((tx) => obrisiTermin(tx, z.uuid().parse(terminId)));
  } catch (e) {
    return { greska: porukaGreske(e) };
  }
  revalidatePath(`/nastava/${kolegijId}`, "layout");
  redirect(`/nastava/${kolegijId}/termini`);
}
