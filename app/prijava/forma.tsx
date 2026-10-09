"use client";

import { useActionState } from "react";
import { Gumb, Polje, Poruka } from "@/components/ui";
import { prijavaAkcija, type StanjePrijave } from "./akcije";

export function FormaPrijave() {
  const [stanje, akcija, salje] = useActionState<StanjePrijave, FormData>(prijavaAkcija, {});
  return (
    <form action={akcija} className="flex flex-col gap-4">
      {stanje.greska && <Poruka vrsta="greska">{stanje.greska}</Poruka>}
      <Polje oznaka="E-mail" name="email" type="email" autoComplete="username" required defaultValue={stanje.email} />
      <Polje oznaka="Lozinka" name="lozinka" type="password" autoComplete="current-password" required />
      <Gumb type="submit" disabled={salje}>{salje ? "Prijava…" : "Prijava"}</Gumb>
    </form>
  );
}
