import { z } from "zod";
import type { SiroviRed } from "./parsiraj";

export const redUvozaShema = z.object({
  jmbag: z
    .string()
    .transform((s) => s.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{10}$/, "JMBAG mora imati točno 10 znamenki")),
  ime: z.string().trim().min(1, "Ime je obavezno").max(100),
  prezime: z.string().trim().min(1, "Prezime je obavezno").max(100),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Neispravna e-mail adresa")),
  grupa_p: z.string().trim().max(50).optional().transform((s) => s || null),
  grupa_v: z.string().trim().max(50).optional().transform((s) => s || null),
});

export type RedUvoza = z.output<typeof redUvozaShema> & { redak: number };
export type GreskaUvoza = { redak: number; jmbag?: string; poruke: string[] };

export function validirajRedove(
  redovi: SiroviRed[],
  grupe: { naziv: string; tip: "predavanje" | "vjezbe" }[],
): { valjani: RedUvoza[]; greske: GreskaUvoza[] } {
  const greske = new Map<number, GreskaUvoza>();
  const dodaj = (redak: number, poruka: string, jmbag?: string) => {
    const g = greske.get(redak) ?? { redak, jmbag, poruke: [] };
    g.poruke.push(poruka);
    greske.set(redak, g);
  };

  const parsirani: RedUvoza[] = [];
  for (const red of redovi) {
    const r = redUvozaShema.safeParse({ ...red, jmbag: red.jmbag ?? "", ime: red.ime ?? "", prezime: red.prezime ?? "", email: red.email ?? "" });
    if (!r.success) {
      r.error.issues.forEach((i) => dodaj(red.redak, i.message, red.jmbag));
      continue;
    }
    const v = { ...r.data, redak: red.redak };
    if (v.grupa_p && !grupe.some((g) => g.tip === "predavanje" && g.naziv === v.grupa_p)) {
      dodaj(red.redak, `Nepoznata grupa predavanja „${v.grupa_p}”`, v.jmbag);
    }
    if (v.grupa_v && !grupe.some((g) => g.tip === "vjezbe" && g.naziv === v.grupa_v)) {
      dodaj(red.redak, `Nepoznata grupa vježbi „${v.grupa_v}”`, v.jmbag);
    }
    parsirani.push(v);
  }

  // Duplikati unutar datoteke: svi retci s istim JMBAG-om ili e-mailom su greška.
  for (const kljuc of ["jmbag", "email"] as const) {
    const poKljucu = Map.groupBy(parsirani, (r) => r[kljuc]);
    for (const [vrijednost, isti] of poKljucu) {
      if (isti.length < 2) continue;
      const retci = isti.map((r) => r.redak).join(", ");
      for (const r of isti) {
        dodaj(r.redak, kljuc === "jmbag" ? `Duplikat JMBAG-a ${vrijednost} (retci ${retci})` : `Isti e-mail u više redaka (${retci})`, r.jmbag);
      }
    }
  }

  return {
    valjani: parsirani.filter((r) => !greske.has(r.redak)),
    greske: [...greske.values()].sort((a, b) => a.redak - b.redak),
  };
}
