"use client";

import { useActionState, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Gumb, Kartica, Oznaka, Polje, Poruka, Tablica } from "@/components/ui";
import type { StavkaPregleda } from "@/lib/csv/usporedi";
import type { PristupniPodaci } from "@/lib/servisi/uvoz";
import { potvrdaAkcija, pregledAkcija, type StanjePotvrde, type StanjePregleda } from "./akcije";

const VRSTE: StavkaPregleda["vrsta"][] = ["novi", "upis_postojeceg", "izmijenjen", "nepromijenjen", "konflikt"];

type Prijevod = ReturnType<typeof useTranslations<"import">>;

export function Carobnjak({ kolegijId, danas }: { kolegijId: string; danas: string }) {
  const t = useTranslations("import");
  const locale = useLocale();
  const [datoteka, setDatoteka] = useState<File | null>(null);
  const [pregled, pregledaj, pregledava] = useActionState<StanjePregleda, FormData>(pregledAkcija.bind(null, kolegijId), { faza: "pocetak" });
  const [potvrda, potvrdi, potvrdjuje] = useActionState<StanjePotvrde, FormData>(potvrdaAkcija.bind(null, kolegijId), {});
  const unos = useRef<HTMLInputElement>(null);

  if (potvrda.rezultat) return <Rezultat rezultat={potvrda.rezultat} preskoceno={potvrda.preskoceno ?? 0} />;

  return (
    <div className="space-y-4">
      <Kartica naslov={t("step1")}>
        <form action={pregledaj} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="locale" value={locale} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("csvFile")}</span>
            <input
              ref={unos}
              type="file"
              name="datoteka"
              accept=".csv,text/csv"
              required
              onChange={(e) => setDatoteka(e.target.files?.[0] ?? null)}
            />
          </label>
          <Gumb disabled={!datoteka || pregledava}>{pregledava ? t("loading") : t("showPreview")}</Gumb>
        </form>
        <p className="mt-3 text-xs text-tekst-slab">{t("help")}</p>
        {pregled.faza === "pocetak" && pregled.greska && <div className="mt-3"><Poruka vrsta="greska">{pregled.greska}</Poruka></div>}
      </Kartica>

      {pregled.faza === "pregled" && (
        <Kartica naslov={t("step2", { file: pregled.nazivDatoteke })}>
          <p className="mb-3 text-xs text-tekst-slab">
            {t("encodingSeparator", { encoding: pregled.kodiranje, separator: pregled.separator })}
            {pregled.nepoznatiStupci.length > 0 && t("ignoredColumns", { columns: pregled.nepoznatiStupci.join(", ") })}
          </p>
          {pregled.greske.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 font-medium text-greska">{t("rowsWithErrors", { count: pregled.greske.length })}</h3>
              <Tablica>
                <thead><tr><th>{t("row")}</th><th>{t("jmbag")}</th><th>{t("error")}</th></tr></thead>
                <tbody>
                  {pregled.greske.map((g) => (
                    <tr key={g.redak}><td>{g.redak}</td><td>{g.jmbag ?? ""}</td><td className="text-greska">{g.poruke.join("; ")}</td></tr>
                  ))}
                </tbody>
              </Tablica>
            </div>
          )}
          {VRSTE.map((vrsta) => {
            const stavke = pregled.pregled.stavke.filter((s) => s.vrsta === vrsta);
            if (stavke.length === 0) return null;
            return (
              <details key={vrsta} open={vrsta !== "nepromijenjen"} className="mb-3">
                <summary className="cursor-pointer font-medium">{t(`kinds.${vrsta}`)} ({stavke.length})</summary>
                <div className="mt-2">
                  <Tablica>
                    <thead><tr><th>{t("row")}</th><th>{t("jmbag")}</th><th>{t("name")}</th><th>{t("email")}</th><th>{t("lectureShort")}</th><th>{t("exerciseShort")}</th><th>{t("note")}</th></tr></thead>
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
                            {s.vrsta === "konflikt" && <span className="text-greska">{s.emailKoristi === "osoblje" ? t("conflictStaff") : t("conflictStudent", { jmbag: s.emailKoristi.jmbag })}</span>}
                            {(s.vrsta === "izmijenjen" || s.vrsta === "upis_postojeceg") &&
                              s.izmjene.map((i) => <div key={i.polje}>{t(`fields.${i.polje}`)}: {i.staro ?? "—"} → {i.novo ?? "—"}</div>)}
                            {s.vrsta === "izmijenjen" && s.promjenaGrupe && <Oznaka ton="upozorenje">{t("groupChange")}</Oznaka>}
                            {s.vrsta === "izmijenjen" && s.ponovniUpis && <Oznaka>{t("reEnrollment")}</Oznaka>}
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
              {t("notInFile", { count: pregled.pregled.nisuUDatoteci.length })}
            </Poruka>
          )}

          <form
            action={(fd) => {
              if (datoteka) fd.set("datoteka", datoteka);
              fd.set("locale", locale);
              potvrdi(fd);
            }}
            className="mt-4 flex flex-wrap items-end gap-3 border-t border-rub pt-4"
          >
            <Polje oznaka={t("groupChangesFrom")} name="datum" type="date" defaultValue={danas} required />
            <Gumb disabled={potvrdjuje || !datoteka}>{potvrdjuje ? t("importing") : t("confirm")}</Gumb>
          </form>
          {potvrda.greska && <div className="mt-3"><Poruka vrsta="greska">{potvrda.greska}</Poruka></div>}
        </Kartica>
      )}
    </div>
  );
}

function preuzmiCsv(t: Prijevod, podaci: PristupniPodaci[]) {
  const redak = (v: string[]) => v.map((x) => `"${x.replaceAll('"', '""')}"`).join(";");
  const zaglavlje = (["jmbag", "prezime", "ime", "email", "lozinka"] as const).map((k) => t(`csvHeaders.${k}`));
  const sadrzaj = "﻿" + [redak(zaglavlje), ...podaci.map((p) => redak([p.jmbag, p.prezime, p.ime, p.email, p.lozinka]))].join("\r\n");
  const url = URL.createObjectURL(new Blob([sadrzaj], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = t("fileName");
  a.click();
  URL.revokeObjectURL(url);
}

function Rezultat({ rezultat, preskoceno }: { rezultat: NonNullable<StanjePotvrde["rezultat"]>; preskoceno: number }) {
  const t = useTranslations("import");
  return (
    <div className="space-y-4">
      <Poruka vrsta="uspjeh">
        {t("finished", {
          new: rezultat.novi,
          existing: rezultat.upisani_postojeci,
          changed: rezultat.izmijenjeni,
          groupChanges: rezultat.promjene_grupe,
          reEnrolled: rezultat.ponovno_upisani,
          unchanged: rezultat.nepromijenjeni,
        })}
        {preskoceno > 0 && ` ${t("skipped", { count: preskoceno })}`}
      </Poruka>
      {rezultat.pristupniPodaci.length > 0 && (
        <Kartica
          naslov={t("credentials")}
          akcije={
            <div className="flex gap-2 print:hidden">
              <Gumb varijanta="sekundarni" onClick={() => preuzmiCsv(t, rezultat.pristupniPodaci)}>{t("downloadCsv")}</Gumb>
              <Gumb varijanta="sekundarni" onClick={() => window.print()}>{t("print")}</Gumb>
            </div>
          }
        >
          <Poruka vrsta="upozorenje">
            {t("passwordWarning")}
          </Poruka>
          <div className="mt-3">
            <Tablica>
              <thead><tr><th>{t("jmbag")}</th><th>{t("name")}</th><th>{t("email")}</th><th>{t("password")}</th></tr></thead>
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
