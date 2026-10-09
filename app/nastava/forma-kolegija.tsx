"use client";

import { useActionState } from "react";
import { Gumb, Odabir, Polje, Poruka } from "@/components/ui";
import { kreirajKolegijAkcija, type StanjeKolegija } from "./akcije";

export function FormaKolegija() {
  const [stanje, akcija, salje] = useActionState<StanjeKolegija, FormData>(kreirajKolegijAkcija, {});
  return (
    <form action={akcija} className="grid gap-3 sm:grid-cols-2">
      {stanje.greska && <div className="sm:col-span-2"><Poruka vrsta="greska">{stanje.greska}</Poruka></div>}
      <Polje oznaka="Naziv" name="naziv" required className="sm:col-span-2" />
      <Polje oznaka="Šifra" name="sifra" required />
      <Polje oznaka="Akademska godina" name="akademska_godina" placeholder="2026/2027" required />
      <Odabir oznaka="Semestar" name="semestar" defaultValue="zimski">
        <option value="zimski">zimski</option>
        <option value="ljetni">ljetni</option>
      </Odabir>
      <Polje oznaka="E-mail nastavnika" name="nastavnik_email" type="email" pomoc="Prazno = vi ste nastavnik." />
      <div className="sm:col-span-2"><Gumb type="submit" disabled={salje}>Kreiraj kolegij</Gumb></div>
    </form>
  );
}
