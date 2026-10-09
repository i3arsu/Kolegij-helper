"use client";

import { useActionState } from "react";
import { Gumb, Odabir, Polje, Poruka } from "@/components/ui";
import { osobljeAkcija, pravilaAkcija, type Stanje } from "./akcije";

type Pravila = { min_dolaznost_predavanja: string; min_dolaznost_vjezbi: string; min_bodova: string; opravdano_se_racuna: string };

export function FormaPravila({ kolegijId, pravila }: { kolegijId: string; pravila: Pravila }) {
  const [stanje, akcija, salje] = useActionState<Stanje, FormData>(pravilaAkcija.bind(null, kolegijId), {});
  return (
    <form action={akcija} className="grid gap-3 sm:grid-cols-2">
      {stanje.greska && <div className="sm:col-span-2"><Poruka vrsta="greska">{stanje.greska}</Poruka></div>}
      {stanje.ok && <div className="sm:col-span-2"><Poruka vrsta="uspjeh">{stanje.ok}</Poruka></div>}
      <Polje oznaka="Min. dolaznost na predavanjima (%)" name="min_dolaznost_predavanja" type="number" min={0} max={100} step="0.5" defaultValue={Number(pravila.min_dolaznost_predavanja)} required />
      <Polje oznaka="Min. dolaznost na vježbama (%)" name="min_dolaznost_vjezbi" type="number" min={0} max={100} step="0.5" defaultValue={Number(pravila.min_dolaznost_vjezbi)} required />
      <Polje oznaka="Min. bodova" name="min_bodova" type="number" min={0} step="0.5" defaultValue={Number(pravila.min_bodova)} required pomoc="Koristi se od faze 2 (zadaci)." />
      <Odabir oznaka="Opravdani izostanak" name="opravdano_se_racuna" defaultValue={pravila.opravdano_se_racuna}>
        <option value="izuzeto">ne ulazi u izračun</option>
        <option value="kao_prisutan">računa se kao prisutnost</option>
        <option value="kao_odsutan">računa se kao izostanak</option>
      </Odabir>
      <div className="sm:col-span-2"><Gumb disabled={salje}>Spremi pravila</Gumb></div>
    </form>
  );
}

export function FormaOsoblja({ kolegijId }: { kolegijId: string }) {
  const [stanje, akcija, salje] = useActionState<Stanje, FormData>(osobljeAkcija.bind(null, kolegijId), {});
  return (
    <form action={akcija} className="flex flex-wrap items-end gap-3">
      {stanje.greska && <div className="w-full"><Poruka vrsta="greska">{stanje.greska}</Poruka></div>}
      {stanje.ok && <div className="w-full"><Poruka vrsta="uspjeh">{stanje.ok}</Poruka></div>}
      <Polje oznaka="E-mail člana osoblja" name="email" type="email" required />
      <Odabir oznaka="Uloga" name="uloga" defaultValue="asistent">
        <option value="asistent">asistent</option>
        <option value="nastavnik">nastavnik</option>
      </Odabir>
      <Gumb disabled={salje}>Dodaj</Gumb>
    </form>
  );
}
