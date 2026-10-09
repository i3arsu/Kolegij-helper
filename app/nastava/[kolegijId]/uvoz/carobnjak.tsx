"use client";

import { useActionState, useRef, useState } from "react";
import { Gumb, Kartica, Oznaka, Polje, Poruka, Tablica } from "@/components/ui";
import type { StavkaPregleda } from "@/lib/csv/usporedi";
import type { PristupniPodaci } from "@/lib/servisi/uvoz";
import { potvrdaAkcija, pregledAkcija, type StanjePotvrde, type StanjePregleda } from "./akcije";

const NAZIV_VRSTE: Record<StavkaPregleda["vrsta"], string> = {
  novi: "Novi studenti",
  upis_postojeceg: "Postojeći računi, novi upis",
  izmijenjen: "Izmjene",
  nepromijenjen: "Bez promjena",
  konflikt: "Konflikti (neće se uvesti)",
};

export function Carobnjak({ kolegijId, danas }: { kolegijId: string; danas: string }) {
  const [datoteka, setDatoteka] = useState<File | null>(null);
  const [pregled, pregledaj, pregledava] = useActionState<StanjePregleda, FormData>(pregledAkcija.bind(null, kolegijId), { faza: "pocetak" });
  const [potvrda, potvrdi, potvrdjuje] = useActionState<StanjePotvrde, FormData>(potvrdaAkcija.bind(null, kolegijId), {});
  const unos = useRef<HTMLInputElement>(null);

  if (potvrda.rezultat) return <Rezultat rezultat={potvrda.rezultat} preskoceno={potvrda.preskoceno ?? 0} />;

  return (
    <div className="space-y-4">
      <Kartica naslov="1. Odabir datoteke">
        <form action={pregledaj} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">CSV datoteka</span>
            <input
              ref={unos}
              type="file"
              name="datoteka"
              accept=".csv,text/csv"
              required
              onChange={(e) => setDatoteka(e.target.files?.[0] ?? null)}
            />
          </label>
          <Gumb disabled={!datoteka || pregledava}>{pregledava ? "Učitavanje…" : "Prikaži pregled"}</Gumb>
        </form>
        <p className="mt-3 text-xs text-tekst-slab">
          Stupci: JMBAG, Ime, Prezime, E-mail, te opcionalno Grupa P i Grupa V. Separator ; ili , — kodiranje UTF-8 ili Windows-1250.
          Ponovni uvoz ažurira postojeće studente i ništa ne briše.
        </p>
        {pregled.faza === "pocetak" && pregled.greska && <div className="mt-3"><Poruka vrsta="greska">{pregled.greska}</Poruka></div>}
      </Kartica>

      {pregled.faza === "pregled" && (
        <Kartica naslov={`2. Pregled: ${pregled.nazivDatoteke}`}>
          <p className="mb-3 text-xs text-tekst-slab">
            Kodiranje {pregled.kodiranje}, separator „{pregled.separator}”
            {pregled.nepoznatiStupci.length > 0 && ` · zanemareni stupci: ${pregled.nepoznatiStupci.join(", ")}`}
          </p>
          {pregled.greske.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 font-medium text-greska">Retci s greškama ({pregled.greske.length}) — neće se uvesti</h3>
              <Tablica>
                <thead><tr><th>Redak</th><th>JMBAG</th><th>Greška</th></tr></thead>
                <tbody>
                  {pregled.greske.map((g) => (
                    <tr key={g.redak}><td>{g.redak}</td><td>{g.jmbag ?? ""}</td><td className="text-greska">{g.poruke.join("; ")}</td></tr>
                  ))}
                </tbody>
              </Tablica>
            </div>
          )}
          {(Object.keys(NAZIV_VRSTE) as StavkaPregleda["vrsta"][]).map((vrsta) => {
            const stavke = pregled.pregled.stavke.filter((s) => s.vrsta === vrsta);
            if (stavke.length === 0) return null;
            return (
              <details key={vrsta} open={vrsta !== "nepromijenjen"} className="mb-3">
                <summary className="cursor-pointer font-medium">{NAZIV_VRSTE[vrsta]} ({stavke.length})</summary>
                <div className="mt-2">
                  <Tablica>
                    <thead><tr><th>Redak</th><th>JMBAG</th><th>Prezime i ime</th><th>E-mail</th><th>P</th><th>V</th><th>Napomena</th></tr></thead>
                    <tbody>
                      {stavke.map((s) => (
                        <tr key={s.red.redak}>
                          <td>{s.red.redak}</td>
                          <td className="tabular-nums">{s.red.jmbag}</td>
                          <td>{s.red.prezime} {s.red.ime}</td>
                          <td>{s.red.email}</td>
                          <td>{s.red.grupa_p ?? ""}</td>
                          <td>{s.red.grupa_v ?? ""}</td>
                          <td className="text-xs">
                            {s.vrsta === "konflikt" && <span className="text-greska">{s.poruka}</span>}
                            {(s.vrsta === "izmijenjen" || s.vrsta === "upis_postojeceg") &&
                              s.izmjene.map((i) => <div key={i.polje}>{i.polje}: {i.staro ?? "—"} → {i.novo ?? "—"}</div>)}
                            {s.vrsta === "izmijenjen" && s.promjenaGrupe && <Oznaka ton="upozorenje">promjena grupe</Oznaka>}
                            {s.vrsta === "izmijenjen" && s.ponovniUpis && <Oznaka>ponovni upis</Oznaka>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Tablica>
                </div>
              </details>
            );
          })}
          {pregled.pregled.nisuUDatoteci.length > 0 && (
            <Poruka vrsta="info">
              {pregled.pregled.nisuUDatoteci.length} upisanih studenata nema u datoteci. Uvoz ih neće mijenjati ni brisati; po potrebi ih
              označite kao ispisane na profilu studenta.
            </Poruka>
          )}

          <form
            action={(fd) => {
              if (datoteka) fd.set("datoteka", datoteka);
              potvrdi(fd);
            }}
            className="mt-4 flex flex-wrap items-end gap-3 border-t border-rub pt-4"
          >
            <Polje oznaka="Promjene grupa vrijede od" name="datum" type="date" defaultValue={danas} required />
            <Gumb disabled={potvrdjuje || !datoteka}>{potvrdjuje ? "Uvoz…" : "3. Potvrdi uvoz"}</Gumb>
          </form>
          {potvrda.greska && <div className="mt-3"><Poruka vrsta="greska">{potvrda.greska}</Poruka></div>}
        </Kartica>
      )}
    </div>
  );
}

function preuzmiCsv(podaci: PristupniPodaci[]) {
  const redak = (v: string[]) => v.map((x) => `"${x.replaceAll('"', '""')}"`).join(";");
  const sadrzaj = "﻿" + [redak(["JMBAG", "Prezime", "Ime", "E-mail", "Lozinka"]), ...podaci.map((p) => redak([p.jmbag, p.prezime, p.ime, p.email, p.lozinka]))].join("\r\n");
  const url = URL.createObjectURL(new Blob([sadrzaj], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "pristupni-podaci.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function Rezultat({ rezultat, preskoceno }: { rezultat: NonNullable<StanjePotvrde["rezultat"]>; preskoceno: number }) {
  return (
    <div className="space-y-4">
      <Poruka vrsta="uspjeh">
        Uvoz završen: {rezultat.novi} novih, {rezultat.upisani_postojeci} upisanih postojećih, {rezultat.izmijenjeni} izmijenjenih
        ({rezultat.promjene_grupe} promjena grupe, {rezultat.ponovno_upisani} ponovnih upisa), {rezultat.nepromijenjeni} bez promjena
        {preskoceno > 0 && `, ${preskoceno} preskočenih redaka`}.
      </Poruka>
      {rezultat.pristupniPodaci.length > 0 && (
        <Kartica
          naslov="Pristupni podaci novih studenata"
          akcije={
            <div className="flex gap-2 print:hidden">
              <Gumb varijanta="sekundarni" onClick={() => preuzmiCsv(rezultat.pristupniPodaci)}>Preuzmi CSV</Gumb>
              <Gumb varijanta="sekundarni" onClick={() => window.print()}>Ispiši</Gumb>
            </div>
          }
        >
          <Poruka vrsta="upozorenje">
            Lozinke se prikazuju samo sada i nigdje se ne spremaju. Preuzmite ih ili ispišite prije napuštanja stranice.
            Datoteku s lozinkama čuvajte sigurno i obrišite je nakon podjele.
          </Poruka>
          <div className="mt-3">
            <Tablica>
              <thead><tr><th>JMBAG</th><th>Prezime i ime</th><th>E-mail</th><th>Lozinka</th></tr></thead>
              <tbody>
                {rezultat.pristupniPodaci.map((p) => (
                  <tr key={p.jmbag} className="break-inside-avoid">
                    <td className="tabular-nums">{p.jmbag}</td>
                    <td>{p.prezime} {p.ime}</td>
                    <td>{p.email}</td>
                    <td><code className="font-semibold">{p.lozinka}</code></td>
                  </tr>
                ))}
              </tbody>
            </Tablica>
          </div>
        </Kartica>
      )}
    </div>
  );
}
