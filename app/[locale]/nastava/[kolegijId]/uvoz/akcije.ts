"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { jezikObrasca } from "@/i18n/obrazac";
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

type Prijevod = Awaited<ReturnType<typeof getTranslations>>;

async function procitaj(forma: FormData, t: Prijevod) {
  const datoteka = forma.get("datoteka");
  if (!(datoteka instanceof File) || datoteka.size === 0) throw new Error(t("errors.chooseFile"));
  if (datoteka.size > MAX_VELICINA) throw new Error(t("errors.tooLarge"));
  const parsirano = parsirajCsv(new Uint8Array(await datoteka.arrayBuffer()));
  if (parsirano.nedostajuciStupci.length) {
    throw new Error(t("errors.missingColumns", { columns: parsirano.nedostajuciStupci.map((p) => t(`fields.${p}`)).join(", ") }));
  }
  if (parsirano.redovi.length === 0) throw new Error(t("errors.noRows"));
  return { datoteka, parsirano };
}

export async function pregledAkcija(kolegijId: string, _: StanjePregleda, forma: FormData): Promise<StanjePregleda> {
  await zahtijevajNastavnika(kolegijId);
  const locale = jezikObrasca(forma);
  const t = await getTranslations({ locale, namespace: "import" });
  const tv = await getTranslations({ locale, namespace: "import.validation" });
  try {
    const { datoteka, parsirano } = await procitaj(forma, t);
    return await upit(async (tx) => {
      const { valjani, greske } = validirajRedove(parsirano.redovi, await grupeKolegija(tx, kolegijId), tv);
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
    return { faza: "pocetak", greska: porukaGreske(e, await getTranslations({ locale, namespace: "errors" })) };
  }
}

export type StanjePotvrde = { greska?: string; rezultat?: RezultatUvoza; preskoceno?: number };

/** Ponovno parsira i validira datoteku na serveru (klijentu se ne vjeruje) i uvozi valjane retke. */
export async function potvrdaAkcija(kolegijId: string, _: StanjePotvrde, forma: FormData): Promise<StanjePotvrde> {
  await zahtijevajNastavnika(kolegijId);
  const locale = jezikObrasca(forma);
  const t = await getTranslations({ locale, namespace: "import" });
  const tv = await getTranslations({ locale, namespace: "import.validation" });
  try {
    const { datoteka, parsirano } = await procitaj(forma, t);
    const datum = String(forma.get("datum") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) throw new Error(t("errors.chooseDate"));
    const rezultat = await upit(async (tx) => {
      const { valjani, greske } = validirajRedove(parsirano.redovi, await grupeKolegija(tx, kolegijId), tv);
      const pregled = await pregledUvoza(tx, kolegijId, valjani);
      const zaUvoz = pregled.stavke.filter((s) => s.vrsta !== "konflikt").map((s) => s.red);
      const r = await izvrsiUvoz(tx, kolegijId, zaUvoz, lokalnoUTrenutak(datum, "00:00"), datoteka.name);
      return { rezultat: r, preskoceno: greske.length + (valjani.length - zaUvoz.length) };
    });
    revalidatePath(`/nastava/${kolegijId}`, "layout");
    return rezultat;
  } catch (e) {
    return { greska: porukaGreske(e, await getTranslations({ locale, namespace: "errors" })) };
  }
}
