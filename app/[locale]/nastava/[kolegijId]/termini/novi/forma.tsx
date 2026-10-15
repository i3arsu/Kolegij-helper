"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Gumb, Odabir, Polje, Poruka } from "@/components/ui";
import { noviTerminAkcija, type Stanje } from "../akcije";

const DANI = ["1", "2", "3", "4", "5", "6", "7"] as const;

export function FormaTermina({ kolegijId, grupe, danas }: { kolegijId: string; grupe: { id: string; naziv: string }[]; danas: string }) {
  const t = useTranslations("teacherSessions");
  const locale = useLocale();
  const [nacin, setNacin] = useState<"jednom" | "tjedno">("jednom");
  const [stanje, akcija, salje] = useActionState<Stanje, FormData>(noviTerminAkcija.bind(null, kolegijId), {});
  return (
    <form action={akcija} className="grid max-w-xl gap-3 sm:grid-cols-2">
      <input type="hidden" name="locale" value={locale} />
      {stanje.greska && <div className="sm:col-span-2"><Poruka vrsta="greska">{stanje.greska}</Poruka></div>}
      <fieldset className="flex gap-4 text-sm sm:col-span-2">
        <label className="flex items-center gap-2"><input type="radio" name="nacin" value="jednom" checked={nacin === "jednom"} onChange={() => setNacin("jednom")} /> {t("singleSession")}</label>
        <label className="flex items-center gap-2"><input type="radio" name="nacin" value="tjedno" checked={nacin === "tjedno"} onChange={() => setNacin("tjedno")} /> {t("weekly")}</label>
      </fieldset>
      <Odabir oznaka={t("group")} name="grupa_id" required defaultValue="" className="sm:col-span-2">
        <option value="" disabled>{t("choose")}</option>
        {grupe.map((g) => <option key={g.id} value={g.id}>{g.naziv}</option>)}
      </Odabir>
      {nacin === "jednom" ? (
        <Polje oznaka={t("date")} name="datum" type="date" defaultValue={danas} required className="sm:col-span-2" />
      ) : (
        <>
          <Polje oznaka={t("fromDate")} name="od_datuma" type="date" defaultValue={danas} required />
          <Polje oznaka={t("toDate")} name="do_datuma" type="date" required />
          <Odabir oznaka={t("weekday")} name="dan" defaultValue="1" className="sm:col-span-2">
            {DANI.map((d) => <option key={d} value={d}>{t(`days.${d}`)}</option>)}
          </Odabir>
        </>
      )}
      <Polje oznaka={t("start")} name="od" type="time" defaultValue="10:00" required />
      <Polje oznaka={t("end")} name="do" type="time" defaultValue="11:30" required />
      <Polje oznaka={t("topic")} name="tema" className="sm:col-span-2" pomoc={nacin === "tjedno" ? t("sameTopicHelp") : undefined} />
      <div className="sm:col-span-2"><Gumb disabled={salje}>{salje ? t("saving") : t("create")}</Gumb></div>
    </form>
  );
}
