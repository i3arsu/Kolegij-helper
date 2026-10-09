"use client";

import { useActionState } from "react";
import { Gumb, Polje, Poruka } from "@/components/ui";
import { promjenaLozinkeAkcija, type StanjePromjene } from "./akcije";

export function FormaPromjene() {
  const [stanje, akcija, salje] = useActionState<StanjePromjene, FormData>(promjenaLozinkeAkcija, {});
  return (
    <form action={akcija} className="flex flex-col gap-4">
      {stanje.greska && <Poruka vrsta="greska">{stanje.greska}</Poruka>}
      <Polje oznaka="Trenutna lozinka" name="stara" type="password" autoComplete="current-password" required />
      <Polje oznaka="Nova lozinka" name="nova" type="password" autoComplete="new-password" minLength={10} required pomoc="Najmanje 10 znakova." />
      <Polje oznaka="Potvrda nove lozinke" name="potvrda" type="password" autoComplete="new-password" minLength={10} required />
      <Gumb type="submit" disabled={salje}>{salje ? "Spremanje…" : "Promijeni lozinku"}</Gumb>
    </form>
  );
}
