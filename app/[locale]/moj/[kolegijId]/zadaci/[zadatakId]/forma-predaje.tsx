
"use client";

import { useState, type FormEvent } from "react";

import {
  Gumb,
  Kartica,
  Polje,
  Poruka,
} from "@/components/ui";

import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

import {
  MAX_BROJ_DATOTEKA,
  MAX_VELICINA_DATOTEKE,
} from "@/lib/datoteke/ogranicenja";

type VrstaPredaje = "prva" | "zamjena" | "dorada";

type Props = {
  zadatakId: string;
  locale: string;
  naciniPredaje: string[];
  vrsta: VrstaPredaje;
  pocetniTekst?: string | null;
  pocetnaPoveznica?: string | null;
};

export function FormaPredaje({
  zadatakId,
  locale,
  naciniPredaje,
  vrsta,
  pocetniTekst,
  pocetnaPoveznica,
}: Props) {
  const t = useTranslations("studentAssignments");
  const router = useRouter();

  const [salje, setSalje] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [uspjeh, setUspjeh] = useState<string | null>(null);

  async function obradiPredaju(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Čuvamo referencu dok je currentTarget još dostupan.
    const formular = event.currentTarget;

    setSalje(true);
    setGreska(null);
    setUspjeh(null);

    try {
      // Prikupljamo podatke iz obrasca.
      const forma = new FormData(formular);

      const tekst = String(forma.get("tekst") ?? "");
      const link = String(forma.get("link") ?? "");

      const datoteke = forma
        .getAll("datoteke")
        .filter(
          (vrijednost): vrijednost is File =>
            vrijednost instanceof File && vrijednost.size > 0,
        );

      // Provjeravamo broj datoteka.
      if (datoteke.length > MAX_BROJ_DATOTEKA) {
        throw new Error(t("form.tooManyFiles"));
      }

      // Provjeravamo veličinu pojedinačne datoteke.
      if (
        datoteke.some(
          (datoteka) => datoteka.size > MAX_VELICINA_DATOTEKE,
        )
      ) {
        throw new Error(t("form.fileTooLarge"));
      }

      // Provjeravamo postoji li barem jedan način predaje.
      const imaTekst =
        naciniPredaje.includes("tekst") && tekst.trim().length > 0;

      const imaLink =
        naciniPredaje.includes("link") && link.trim().length > 0;

      const imaDatoteke =
        naciniPredaje.includes("datoteka") && datoteke.length > 0;

      if (!imaTekst && !imaLink && !imaDatoteke) {
        throw new Error(t("form.required"));
      }

      // Pripremamo podatke za API.
      const podaci = new FormData();

      podaci.set("locale", locale);
      podaci.set("tekst", tekst);
      podaci.set("link", link);

      datoteke.forEach((datoteka) => {
        podaci.append("datoteke", datoteka);
      });

      // Šaljemo predaju na server.
      const odgovor = await fetch(`/api/predaje/${zadatakId}`, {
        method: "POST",
        body: podaci,
      });

      const rezultat = await odgovor.json().catch(() => null);

      if (!odgovor.ok) {
        const poruka =
          typeof rezultat?.greska === "string"
            ? rezultat.greska
            : t("form.error");

        throw new Error(poruka);
      }

      // Predaja je uspješno spremljena.
      setUspjeh(t("form.success"));

      // Osvježavamo podatke stranice.
      router.refresh();
    } catch (error) {
      setGreska(
        error instanceof Error ? error.message : t("form.error"),
      );
    } finally {
      setSalje(false);
    }
  }

  const naslov =
    vrsta === "prva"
      ? t("form.firstTitle")
      : vrsta === "zamjena"
        ? t("form.replaceTitle")
        : t("form.revisionTitle");

  const gumb =
    vrsta === "prva"
      ? t("form.submitFirst")
      : vrsta === "zamjena"
        ? t("form.replace")
        : t("form.submitRevision");

  return (
    <Kartica naslov={naslov}>
      <form onSubmit={obradiPredaju} className="space-y-4">
        {naciniPredaje.includes("tekst") && (
          <div className="space-y-2">
            <label
              htmlFor="tekst"
              className="block text-sm font-medium"
            >
              {t("form.text")}
            </label>

            <textarea
              id="tekst"
              name="tekst"
              rows={6}
              maxLength={20000}
              defaultValue={pocetniTekst ?? ""}
              className="w-full rounded-md border border-rub bg-povrsina px-3 py-2"
            />
          </div>
        )}

        {naciniPredaje.includes("link") && (
          <Polje
            id="link"
            name="link"
            type="url"
            oznaka={t("form.link")}
            defaultValue={pocetnaPoveznica ?? ""}
            placeholder="https://..."
          />
        )}

        {naciniPredaje.includes("datoteka") && (
          <div className="space-y-2">
            <label
              htmlFor="datoteke"
              className="block text-sm font-medium"
            >
              {t("form.files")}
            </label>

            <input
              id="datoteke"
              name="datoteke"
              type="file"
              multiple
              className="block w-full text-sm text-tekst-slab file:mr-3 file:rounded-md file:border file:border-rub file:bg-povrsina file:px-3 file:py-2 file:text-tekst"
            />

            <p className="text-sm text-tekst-slab">
              {t("form.filesHelp")}
            </p>
          </div>
        )}

        {vrsta === "zamjena" && (
          <Poruka vrsta="upozorenje">
            {t("form.replaceFilesNote")}
          </Poruka>
        )}

        {greska && (
          <Poruka vrsta="greska">
            {greska}
          </Poruka>
        )}

        {uspjeh && (
          <Poruka vrsta="uspjeh">
            {uspjeh}
          </Poruka>
        )}

        <Gumb
          type="submit"
          disabled={salje}
          varijanta="primarni"
        >
          {salje ? t("form.sending") : gumb}
        </Gumb>
      </form>
    </Kartica>
  );
}