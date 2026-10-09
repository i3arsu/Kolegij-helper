"use client";

import { useActionState } from "react";
import { Gumb, Odabir, Polje, Poruka } from "@/components/ui";
import { promjenaGrupeAkcija, resetLozinkeAkcija, type StanjeGrupe, type StanjeReseta } from "./akcije";

export function ResetLozinke({ kolegijId, studentId }: { kolegijId: string; studentId: string }) {
  const [stanje, akcija, salje] = useActionState<StanjeReseta>(resetLozinkeAkcija.bind(null, kolegijId, studentId), {});
  return (
    <form
      action={akcija}
      onSubmit={(e) => {
        if (!confirm("Generirati novu lozinku? Stara prestaje vrijediti i student se odjavljuje sa svih uređaja.")) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      {stanje.greska && <Poruka vrsta="greska">{stanje.greska}</Poruka>}
      {stanje.lozinka && (
        <Poruka vrsta="uspjeh">
          Nova lozinka (prikazuje se samo sada): <code className="select-all text-base font-semibold">{stanje.lozinka}</code>
          <br />Student će je morati promijeniti pri prvoj prijavi.
        </Poruka>
      )}
      <Gumb varijanta="sekundarni" disabled={salje}>Resetiraj lozinku</Gumb>
    </form>
  );
}

export function PromjenaGrupe({
  kolegijId,
  upisId,
  grupe,
  danas,
}: {
  kolegijId: string;
  upisId: string;
  grupe: { id: string; naziv: string; tip: string }[];
  danas: string;
}) {
  const [stanje, akcija, salje] = useActionState<StanjeGrupe, FormData>(promjenaGrupeAkcija.bind(null, kolegijId, upisId), {});
  return (
    <form action={akcija} className="flex flex-col gap-3">
      {stanje.greska && <Poruka vrsta="greska">{stanje.greska}</Poruka>}
      {stanje.ok && <Poruka vrsta="uspjeh">Grupa je promijenjena.</Poruka>}
      <Odabir oznaka="Nova grupa" name="grupa_id" required defaultValue="">
        <option value="" disabled>Odaberite…</option>
        {grupe.map((g) => <option key={g.id} value={g.id}>{g.naziv} ({g.tip === "predavanje" ? "P" : "V"})</option>)}
      </Odabir>
      <Polje oznaka="Vrijedi od" name="datum" type="date" defaultValue={danas} required pomoc="Termini prije ovog datuma ostaju u staroj grupi." />
      <Gumb varijanta="sekundarni" disabled={salje}>Promijeni grupu</Gumb>
    </form>
  );
}
