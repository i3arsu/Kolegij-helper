"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { jezikIz, jezikObrasca, prefiksJezika } from "@/i18n/obrazac";
import { upit, zahtijevajOsoblje } from "@/lib/auth/guard";
import { generirajPonavljajuce } from "@/lib/domena/termini";
import { lokalnoUTrenutak } from "@/lib/domena/vrijeme";
import { GreskaAplikacije, porukaGreske } from "@/lib/http/greske";
import { dodajGosta, kreirajTermine, obrisiTermin, postaviOtkazan, spremiEvidenciju, type StatusDolaska } from "@/lib/servisi/termini";

export type Stanje = { greska?: string; ok?: string };

type Prijevod = Awaited<ReturnType<typeof getTranslations>>;

function shemaTermina(t: Prijevod) {
  const vrijeme = z.string().regex(/^\d{2}:\d{2}$/, t("validation.invalidTime"));
  return z.discriminatedUnion("nacin", [
    z.object({
      nacin: z.literal("jednom"),
      grupa_id: z.uuid(t("validation.selectGroup")),
      datum: z.iso.date(t("validation.selectDate")),
      od: vrijeme,
      do: vrijeme,
      tema: z.string().trim().max(200).optional(),
    }),
    z.object({
      nacin: z.literal("tjedno"),
      grupa_id: z.uuid(t("validation.selectGroup")),
      od_datuma: z.iso.date(t("validation.selectStartDate")),
      do_datuma: z.iso.date(t("validation.selectEndDate")),
      dan: z.coerce.number().int().min(1).max(7),
      od: vrijeme,
      do: vrijeme,
      tema: z.string().trim().max(200).optional(),
    }),
  ]);
}

export async function noviTerminAkcija(kolegijId: string, _: Stanje, forma: FormData): Promise<Stanje> {
  await zahtijevajOsoblje(kolegijId);
  const locale = jezikObrasca(forma);
  const t = await getTranslations({ locale, namespace: "teacherSessions" });
  const p = shemaTermina(t).safeParse(Object.fromEntries(forma));
  if (!p.success) return { greska: p.error.issues[0].message };
  const d = p.data;
  try {
    if (d.od >= d.do) throw new GreskaAplikacije("endAfterStart");
    const termini =
      d.nacin === "jednom"
        ? [{ pocetak: lokalnoUTrenutak(d.datum, d.od), kraj: lokalnoUTrenutak(d.datum, d.do) }]
        : generirajPonavljajuce({ odDatuma: d.od_datuma, doDatuma: d.do_datuma, danUTjednu: d.dan, vrijemeOd: d.od, vrijemeDo: d.do });
    if (termini.length === 0) throw new Error(t("validation.noWeekday"));
    await upit((tx) => kreirajTermine(tx, kolegijId, d.grupa_id, termini, d.tema || null));
  } catch (e) {
    return { greska: porukaGreske(e, await getTranslations({ locale, namespace: "errors" })) };
  }
  revalidatePath(`/nastava/${kolegijId}`, "layout");
  redirect(`${prefiksJezika(locale)}/nastava/${kolegijId}/termini`);
}

const STATUSI = ["prisutan", "odsutan", "opravdano"] as const;

export async function evidencijaAkcija(kolegijId: string, terminId: string, _: Stanje, forma: FormData): Promise<Stanje> {
  await zahtijevajOsoblje(kolegijId);
  const locale = jezikObrasca(forma);
  const t = await getTranslations({ locale, namespace: "teacherSessions" });
  const stavke: { studentId: string; status: StatusDolaska; napomena: string | null; gost: boolean }[] = [];
  for (const [kljuc, vrijednost] of forma) {
    const m = /^status:([0-9a-f-]{36})$/.exec(kljuc);
    if (!m) continue;
    if (!STATUSI.includes(vrijednost as StatusDolaska)) return { greska: t("validation.invalidStatus") };
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
    return { greska: porukaGreske(e, await getTranslations({ locale, namespace: "errors" })) };
  }
  revalidatePath(`/nastava/${kolegijId}`, "layout");
  return { ok: t("attendanceSaved", { count: stavke.length }) };
}

export async function gostAkcija(kolegijId: string, terminId: string, _: Stanje, forma: FormData): Promise<Stanje> {
  await zahtijevajOsoblje(kolegijId);
  const locale = jezikObrasca(forma);
  const t = await getTranslations({ locale, namespace: "teacherSessions" });
  const jmbag = String(forma.get("jmbag") ?? "").replace(/\s/g, "");
  if (!/^\d{10}$/.test(jmbag)) return { greska: t("validation.invalidJmbag") };
  try {
    await upit((tx) => dodajGosta(tx, z.uuid().parse(terminId), jmbag));
  } catch (e) {
    return { greska: porukaGreske(e, await getTranslations({ locale, namespace: "errors" })) };
  }
  revalidatePath(`/nastava/${kolegijId}/termini/${terminId}`);
  return { ok: t("guestAdded") };
}

export async function otkaziAkcija(kolegijId: string, terminId: string, otkazan: boolean) {
  await zahtijevajOsoblje(kolegijId);
  await upit((tx) => postaviOtkazan(tx, z.uuid().parse(terminId), otkazan));
  revalidatePath(`/nastava/${kolegijId}`, "layout");
}

export async function obrisiAkcija(kolegijId: string, terminId: string, locale: string): Promise<Stanje> {
  await zahtijevajOsoblje(kolegijId);
  try {
    await upit((tx) => obrisiTermin(tx, z.uuid().parse(terminId)));
  } catch (e) {
    return { greska: porukaGreske(e, await getTranslations({ locale: jezikIz(locale), namespace: "errors" })) };
  }
  revalidatePath(`/nastava/${kolegijId}`, "layout");
  redirect(`${prefiksJezika(jezikIz(locale))}/nastava/${kolegijId}/termini`);
}
