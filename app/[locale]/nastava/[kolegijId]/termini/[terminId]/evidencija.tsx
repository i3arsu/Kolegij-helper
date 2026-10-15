"use client";

import { useActionState, useState } from "react";
import { Gumb, Poruka } from "@/components/ui";
import { evidencijaAkcija, gostAkcija, type Stanje } from "../akcije";

type Status = "prisutan" | "odsutan" | "opravdano";
type Student = { student_id: string; jmbag: string; ime: string; prezime: string; status: Status | null; napomena: string | null; gost: boolean };

const OZNAKE: Record<Status, string> = { prisutan: "P", odsutan: "O", opravdano: "Opr" };
const NASLOVI: Record<Status, string> = { prisutan: "Prisutan", odsutan: "Odsutan", opravdano: "Opravdano" };

export function Evidencija({ kolegijId, terminId, studenti, spremljena }: { kolegijId: string; terminId: string; studenti: Student[]; spremljena: boolean }) {
  // Prije prve evidencije svi su "odsutni"; nastavnik označava prisutne ili koristi "Svi prisutni".
  const [statusi, setStatusi] = useState<Record<string, Status>>(() =>
    Object.fromEntries(studenti.map((s) => [s.student_id, s.status ?? "odsutan"])),
  );
  const [stanje, akcija, salje] = useActionState<Stanje, FormData>(evidencijaAkcija.bind(null, kolegijId, terminId), {});
  const [stanjeGosta, dodajGosta, dodaje] = useActionState<Stanje, FormData>(gostAkcija.bind(null, kolegijId, terminId), {});
  const broj = (s: Status) => Object.values(statusi).filter((x) => x === s).length;

  return (
    <div className="space-y-4">
      <form action={akcija} className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Gumb type="button" varijanta="sekundarni" onClick={() => setStatusi(Object.fromEntries(studenti.map((s) => [s.student_id, "prisutan"])))}>Svi prisutni</Gumb>
          <span className="text-tekst-slab">Prisutno {broj("prisutan")} · odsutno {broj("odsutan")} · opravdano {broj("opravdano")}</span>
        </div>
        {stanje.greska && <Poruka vrsta="greska">{stanje.greska}</Poruka>}
        {stanje.ok && <Poruka vrsta="uspjeh">{stanje.ok}</Poruka>}
        <ul className="divide-y divide-rub rounded-lg border border-rub bg-povrsina">
          {studenti.map((s) => (
            <li key={s.student_id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <div className="min-w-48 flex-1">
                <div className="font-medium">{s.prezime} {s.ime}{s.gost && <span className="ml-1 text-xs text-tekst-slab">(gost)</span>}</div>
                <div className="text-xs text-tekst-slab tabular-nums">{s.jmbag}</div>
              </div>
              <fieldset className="flex gap-1" aria-label={`Status: ${s.prezime} ${s.ime}`}>
                {(Object.keys(OZNAKE) as Status[]).map((st) => (
                  <label key={st} title={NASLOVI[st]} className="cursor-pointer">
                    <input
                      type="radio"
                      className="peer sr-only"
                      name={`status:${s.student_id}`}
                      value={st}
                      checked={statusi[s.student_id] === st}
                      onChange={() => setStatusi((p) => ({ ...p, [s.student_id]: st }))}
                    />
                    <span className="inline-block min-w-10 rounded-md border border-rub px-2 py-1 text-center text-sm peer-checked:border-naglasak peer-checked:bg-naglasak peer-checked:text-naglasak-tekst peer-focus-visible:outline-2">
                      {OZNAKE[st]}
                    </span>
                  </label>
                ))}
              </fieldset>
              {s.gost && <input type="hidden" name={`gost:${s.student_id}`} value="1" />}
              <input
                name={`napomena:${s.student_id}`}
                defaultValue={s.napomena ?? ""}
                placeholder="Napomena"
                aria-label="Napomena"
                className="w-40 rounded-md border border-rub bg-povrsina px-2 py-1 text-sm"
              />
            </li>
          ))}
          {studenti.length === 0 && <li className="px-3 py-2 text-sm text-tekst-slab">U grupi nema studenata.</li>}
        </ul>
        <Gumb disabled={salje || studenti.length === 0}>{salje ? "Spremanje…" : spremljena ? "Spremi izmjene" : "Spremi evidenciju"}</Gumb>
      </form>

      <form action={dodajGosta} className="flex flex-wrap items-end gap-2 border-t border-rub pt-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Dodaj gosta (student iz druge grupe)</span>
          <input name="jmbag" inputMode="numeric" placeholder="JMBAG" className="rounded-md border border-rub bg-povrsina px-3 py-2" />
        </label>
        <Gumb varijanta="sekundarni" disabled={dodaje}>Dodaj</Gumb>
        {stanjeGosta.greska && <Poruka vrsta="greska">{stanjeGosta.greska}</Poruka>}
        <p className="w-full text-xs text-tekst-slab">Dolazak gosta ne ulazi u postotak dolaznosti. Za nadoknadu označite izostanak u vlastitoj grupi kao opravdan.</p>
      </form>
    </div>
  );
}
