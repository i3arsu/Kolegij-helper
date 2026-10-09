import Link from "next/link";
import { GumbLink, Odabir, Postotak, Tablica } from "@/components/ui";
import { upit } from "@/lib/auth/guard";
import { formatDatum } from "@/lib/domena/vrijeme";
import { studentiKolegija } from "@/lib/servisi/studenti";
import { grupeKolegija } from "@/lib/servisi/uvoz";

export default async function Studenti({ params, searchParams }: PageProps<"/nastava/[kolegijId]/studenti">) {
  const { kolegijId } = await params;
  const sp = await searchParams;
  const grupa = typeof sp.grupa === "string" ? sp.grupa : "";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const ispod = sp.ispod === "1";
  const ispisani = sp.ispisani === "1";

  const { studenti, grupe } = await upit(async (tx) => ({
    studenti: await studentiKolegija(tx, kolegijId, ispisani),
    grupe: await grupeKolegija(tx, kolegijId),
  }));

  const filtrirani = studenti.filter((s) => {
    if (grupa && s.grupa_p !== grupa && s.grupa_v !== grupa) return false;
    if (ispod) {
      const p = s.dolaznost_p !== null && s.prag_p !== null && s.dolaznost_p < s.prag_p;
      const v = s.dolaznost_v !== null && s.prag_v !== null && s.dolaznost_v < s.prag_v;
      if (!p && !v) return false;
    }
    if (q && ![s.ime, s.prezime, s.jmbag, s.email].some((x) => x.toLowerCase().includes(q))) return false;
    return true;
  });

  return (
    <>
      <form className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Pretraga</span>
          <input name="q" defaultValue={q} placeholder="Ime, JMBAG, e-mail" className="rounded-md border border-rub bg-povrsina px-3 py-2" />
        </label>
        <Odabir oznaka="Grupa" name="grupa" defaultValue={grupa}>
          <option value="">Sve</option>
          {grupe.map((g) => <option key={g.id} value={g.naziv}>{g.naziv}</option>)}
        </Odabir>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="ispod" value="1" defaultChecked={ispod} /> Ispod praga</label>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="ispisani" value="1" defaultChecked={ispisani} /> Uključi ispisane</label>
        <button className="rounded-md border border-rub bg-povrsina px-3 py-2 text-sm">Filtriraj</button>
        <GumbLink href={`/nastava/${kolegijId}/studenti`}>Poništi</GumbLink>
      </form>
      <p className="mb-2 text-sm text-tekst-slab">{filtrirani.length} od {studenti.length} studenata</p>
      <Tablica>
        <thead>
          <tr><th>Prezime i ime</th><th>JMBAG</th><th>Grupa P</th><th>Grupa V</th><th>Dolaznost P</th><th>Dolaznost V</th><th>Zadnja prijava</th></tr>
        </thead>
        <tbody>
          {filtrirani.map((s) => (
            <tr key={s.student_id} className={s.status === "ispisan" ? "text-tekst-slab" : undefined}>
              <td>
                <Link className="font-medium hover:underline" href={`/nastava/${kolegijId}/studenti/${s.student_id}`}>{s.prezime} {s.ime}</Link>
                {s.status === "ispisan" && " (ispisan)"}
              </td>
              <td className="tabular-nums">{s.jmbag}</td>
              <td>{s.grupa_p ?? "—"}</td>
              <td>{s.grupa_v ?? "—"}</td>
              <td><Postotak vrijednost={s.dolaznost_p} prag={s.prag_p} /></td>
              <td><Postotak vrijednost={s.dolaznost_v} prag={s.prag_v} /></td>
              <td className="text-tekst-slab">{s.zadnja_prijava ? formatDatum(s.zadnja_prijava) : "nikad"}</td>
            </tr>
          ))}
          {filtrirani.length === 0 && <tr><td colSpan={7} className="text-tekst-slab">Nema studenata.</td></tr>}
        </tbody>
      </Tablica>
    </>
  );
}
