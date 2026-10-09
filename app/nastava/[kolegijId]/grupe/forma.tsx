"use client";

import { useActionState } from "react";
import { Gumb, Odabir, Polje, Poruka } from "@/components/ui";
import { novaGrupaAkcija, type Stanje } from "./akcije";

export function FormaGrupe({ kolegijId }: { kolegijId: string }) {
  const [stanje, akcija, salje] = useActionState<Stanje, FormData>(novaGrupaAkcija.bind(null, kolegijId), {});
  return (
    <form action={akcija} className="flex flex-wrap items-end gap-3">
      {stanje.greska && <div className="w-full"><Poruka vrsta="greska">{stanje.greska}</Poruka></div>}
      <Polje oznaka="Naziv" name="naziv" placeholder="V4" required />
      <Odabir oznaka="Tip" name="tip" defaultValue="vjezbe">
        <option value="predavanje">Predavanja</option>
        <option value="vjezbe">Vježbe</option>
      </Odabir>
      <Gumb disabled={salje}>Dodaj grupu</Gumb>
    </form>
  );
}
