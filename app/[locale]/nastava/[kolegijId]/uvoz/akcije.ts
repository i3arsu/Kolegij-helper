"use server";

import { revalidatePath } from "next/cache";
import { upit, zahtijevajNastavnika } from "@/lib/auth/guard";
import { parsirajCsv } from "@/lib/csv/parsiraj";
import type { PregledUvoza } from "@/lib/csv/usporedi";
import { validirajRedove, type GreskaUvoza } from "@/lib/csv/validiraj";
import { lokalnoUTrenutak } from "@/lib/domena/vrijeme";
import { porukaGreske } from "@/lib/http/greske";
import { grupeKolegija, izvrsiUvoz, pregledUvoza, type RezultatUvoza } from "@/lib/servisi/uvoz";

const MAX_VELICINA = 1024 * 1024;

export type StanjePregleda =
  | { faza: "pocetak"; greska?: string }
  | {
      faza: "pregled";
      nazivDatoteke: string;
      kodiranje: string;
      separator: string;
      nepoznatiStupci: string[];
      greske: GreskaUvoza[];
      pregled: PregledUvoza;
    };

async function procitaj(forma: FormData) {
  const datoteka = forma.get("datoteka");
  if (!(datoteka instanceof File) || datoteka.size === 0) throw new Error("Odaberite CSV datoteku.");
  if (datoteka.size > MAX_VELICINA) throw new Error("Datoteka je veća od 1 MB.");
  const parsirano = parsirajCsv(new Uint8Array(await datoteka.arrayBuffer()));
  if (parsirano.nedostajuciStupci.length) {
    throw new Error(`Nedostaju stupci: ${parsirano.nedostajuciStupci.join(", ")}. Potrebni su JMBAG, Ime, Prezime i E-mail.`);
  }
  if (parsirano.redovi.length === 0) throw new Error("Datoteka nema redaka s podacima.");
  return { datoteka, parsirano };
}

export async function pregledAkcija(kolegijId: string, _: StanjePregleda, forma: FormData): Promise<StanjePregleda> {
  await zahtijevajNastavnika(kolegijId);
  try {
    const { datoteka, parsirano } = await procitaj(forma);
    return await upit(async (tx) => {
      const { valjani, greske } = validirajRedove(parsirano.redovi, await grupeKolegija(tx, kolegijId));
      return {
        faza: "pregled",
        nazivDatoteke: datoteka.name,
        kodiranje: parsirano.kodiranje,
        separator: parsirano.separator,
        nepoznatiStupci: parsirano.nepoznatiStupci,
        greske,
        pregled: await pregledUvoza(tx, kolegijId, valjani),
      };
    });
  } catch (e) {
    return { faza: "pocetak", greska: porukaGreske(e) };
  }
}

export type StanjePotvrde = { greska?: string; rezultat?: RezultatUvoza; preskoceno?: number };

/** Ponovno parsira i validira datoteku na serveru (klijentu se ne vjeruje) i uvozi valjane retke. */
export async function potvrdaAkcija(kolegijId: string, _: StanjePotvrde, forma: FormData): Promise<StanjePotvrde> {
  await zahtijevajNastavnika(kolegijId);
  try {
    const { datoteka, parsirano } = await procitaj(forma);
    const datum = String(forma.get("datum") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) throw new Error("Odaberite datum promjene grupa.");
    const rezultat = await upit(async (tx) => {
      const { valjani, greske } = validirajRedove(parsirano.redovi, await grupeKolegija(tx, kolegijId));
      const pregled = await pregledUvoza(tx, kolegijId, valjani);
      const zaUvoz = pregled.stavke.filter((s) => s.vrsta !== "konflikt").map((s) => s.red);
      const r = await izvrsiUvoz(tx, kolegijId, zaUvoz, lokalnoUTrenutak(datum, "00:00"), datoteka.name);
      return { rezultat: r, preskoceno: greske.length + (valjani.length - zaUvoz.length) };
    });
    revalidatePath(`/nastava/${kolegijId}`, "layout");
    return rezultat;
  } catch (e) {
    return { greska: porukaGreske(e) };
  }
}
