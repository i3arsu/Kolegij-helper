"use client";

import { useActionState, useState } from "react";
import { Gumb, Odabir, Polje, Poruka } from "@/components/ui";
import { noviTerminAkcija, type Stanje } from "../akcije";

const DANI = ["ponedjeljak", "utorak", "srijeda", "četvrtak", "petak", "subota", "nedjelja"];

export function FormaTermina({ kolegijId, grupe, danas }: { kolegijId: string; grupe: { id: string; naziv: string }[]; danas: string }) {
  const [nacin, setNacin] = useState<"jednom" | "tjedno">("jednom");
  const [stanje, akcija, salje] = useActionState<Stanje, FormData>(noviTerminAkcija.bind(null, kolegijId), {});
  return (
    <form action={akcija} className="grid max-w-xl gap-3 sm:grid-cols-2">
      {stanje.greska && <div className="sm:col-span-2"><Poruka vrsta="greska">{stanje.greska}</Poruka></div>}
      <fieldset className="flex gap-4 text-sm sm:col-span-2">
        <label className="flex items-center gap-2"><input type="radio" name="nacin" value="jednom" checked={nacin === "jednom"} onChange={() => setNacin("jednom")} /> Jedan termin</label>
        <label className="flex items-center gap-2"><input type="radio" name="nacin" value="tjedno" checked={nacin === "tjedno"} onChange={() => setNacin("tjedno")} /> Tjedno ponavljanje</label>
      </fieldset>
      <Odabir oznaka="Grupa" name="grupa_id" required defaultValue="" className="sm:col-span-2">
        <option value="" disabled>Odaberite…</option>
        {grupe.map((g) => <option key={g.id} value={g.id}>{g.naziv}</option>)}
      </Odabir>
      {nacin === "jednom" ? (
        <Polje oznaka="Datum" name="datum" type="date" defaultValue={danas} required className="sm:col-span-2" />
      ) : (
        <>
          <Polje oznaka="Od datuma" name="od_datuma" type="date" defaultValue={danas} required />
          <Polje oznaka="Do datuma (uključivo)" name="do_datuma" type="date" required />
          <Odabir oznaka="Dan u tjednu" name="dan" defaultValue="1" className="sm:col-span-2">
            {DANI.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
          </Odabir>
        </>
      )}
      <Polje oznaka="Početak" name="od" type="time" defaultValue="10:00" required />
      <Polje oznaka="Kraj" name="do" type="time" defaultValue="11:30" required />
      <Polje oznaka="Tema" name="tema" className="sm:col-span-2" pomoc={nacin === "tjedno" ? "Ista tema za sve termine; može se kasnije promijeniti." : undefined} />
      <div className="sm:col-span-2"><Gumb disabled={salje}>{salje ? "Spremanje…" : "Kreiraj"}</Gumb></div>
    </form>
  );
}
