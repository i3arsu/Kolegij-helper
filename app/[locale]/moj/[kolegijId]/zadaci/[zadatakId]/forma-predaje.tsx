
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

type VrstaPredaje = "prva" | "zamjena" | "dorada";

type Props = {
  zadatakId: string;
  locale: string;
  naciniPredaje: string[];
  vrsta: VrstaPredaje;
  pocetniTekst?: string | null;
  pocetnaPoveznica?: string | null;
};

const MAX_DATOTEKA = 5;
const MAX_VELICINA = 20 * 1024 * 1024;

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
            vrijednost instanceof File && vrijednost.size > 0
        );

      // Validacija broja datoteka.
      if (datoteke.length > MAX_DATOTEKA) {
        throw new Error(t("form.tooManyFiles"));
      }

      // Validacija veličine pojedinačne datoteke.
      if (datoteke.some((datoteka) => datoteka.size > MAX_VELICINA)) {
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

      // Koristimo spremljenu referencu, a ne event.currentTarget.
      formular.reset();

      // Osvježavamo podatke stranice.
      router.refresh();
    } catch (error) {
      setGreska(
        error instanceof Error ? error.message : t("form.error")
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
    <section className="space-y-4 rounded-xl border border-gray-200 p-5">
      <h2 className="text-lg font-semibold">{naslov}</h2>

      <form onSubmit={obradiPredaju} className="space-y-4">
        {naciniPredaje.includes("tekst") && (
          <div className="space-y-2">
            <label htmlFor="tekst" className="block text-sm font-medium">
              {t("form.text")}
            </label>

            <textarea
              id="tekst"
              name="tekst"
              rows={6}
              maxLength={20000}
              defaultValue={pocetniTekst ?? ""}
              className="w-full rounded-lg border border-gray-300 p-3"
            />
          </div>
        )}

        {naciniPredaje.includes("link") && (
          <div className="space-y-2">
            <label htmlFor="link" className="block text-sm font-medium">
              {t("form.link")}
            </label>

            <input
              id="link"
              name="link"
              type="url"
              defaultValue={pocetnaPoveznica ?? ""}
              placeholder="https://..."
              className="w-full rounded-lg border border-gray-300 p-3"
            />
          </div>
        )}

        {naciniPredaje.includes("datoteka") && (
          <div className="space-y-2">
            <label htmlFor="datoteke" className="block text-sm font-medium">
              {t("form.files")}
            </label>

            <input
              id="datoteke"
              name="datoteke"
              type="file"
              multiple
              className="block w-full text-sm"
            />

            <p className="text-sm text-gray-500">
              {t("form.filesHelp")}
            </p>
          </div>
        )}

        {vrsta === "zamjena" && (
          <p className="text-sm text-amber-700">
            {t("form.replaceFilesNote")}
          </p>
        )}

        {greska && (
          <p role="alert" className="text-sm text-red-600">
            {greska}
          </p>
        )}

        {uspjeh && (
          <p role="status" className="text-sm text-green-700">
            {uspjeh}
          </p>
        )}

        <button
          type="submit"
          disabled={salje}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {salje ? t("form.sending") : gumb}
        </button>
      </form>
    </section>
  );
}