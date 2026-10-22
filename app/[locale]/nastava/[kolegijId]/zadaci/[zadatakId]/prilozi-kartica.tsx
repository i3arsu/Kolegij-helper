
"use client";

import { useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

import {
  Gumb,
  Kartica,
  Poruka,
} from "@/components/ui";

type Prilog = {
  id: string;
  naziv: string;
  velicina: number;
};

export function PriloziZadatkaKartica({
  zadatakId,
  prilozi,
  mozeUpravljati,
}: {
  zadatakId: string;
  prilozi: Prilog[];
  mozeUpravljati: boolean;
}) {
  const t = useTranslations("assignmentAttachments");
  const locale = useLocale();
  const router = useRouter();

  const unosDatoteke = useRef<HTMLInputElement>(null);

  const [salje, postaviSalje] = useState(false);
  const [briseId, postaviBriseId] = useState<string | null>(null);
  const [greska, postaviGresku] = useState<string | null>(null);
  const [uspjeh, postaviUspjeh] = useState<string | null>(null);

  async function dodajPrilog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    postaviGresku(null);
    postaviUspjeh(null);

    const datoteka = unosDatoteke.current?.files?.[0];

    if (!datoteka) {
      postaviGresku(t("fileRequired"));
      return;
    }

    postaviSalje(true);

    try {
      const forma = new FormData();
      forma.set("locale", locale);
      forma.set("datoteka", datoteka);

      const odgovor = await fetch(
        `/api/zadaci/${zadatakId}/prilozi`,
        {
          method: "POST",
          body: forma,
        },
      );

      const tijelo: { greska?: unknown } | null =
        await odgovor.json().catch(() => null);

      if (!odgovor.ok) {
        postaviGresku(
          typeof tijelo?.greska === "string"
            ? tijelo.greska
            : t("uploadFailed"),
        );
        return;
      }

      if (unosDatoteke.current) {
        unosDatoteke.current.value = "";
      }

      postaviUspjeh(t("uploadSuccess"));
      router.refresh();
    } catch {
      postaviGresku(t("uploadFailed"));
    } finally {
      postaviSalje(false);
    }
  }

  async function ukloniPrilog(prilog: Prilog) {
    if (
      !window.confirm(
        t("confirmDelete", { name: prilog.naziv }),
      )
    ) {
      return;
    }

    postaviGresku(null);
    postaviUspjeh(null);
    postaviBriseId(prilog.id);

    try {
      const odgovor = await fetch(
        `/api/zadaci/${zadatakId}/prilozi/${prilog.id}?locale=${encodeURIComponent(locale)}`,
        { method: "DELETE" },
      );

      const tijelo: { greska?: unknown } | null =
        await odgovor.json().catch(() => null);

      if (!odgovor.ok) {
        postaviGresku(
          typeof tijelo?.greska === "string"
            ? tijelo.greska
            : t("deleteFailed"),
        );
        return;
      }

      postaviUspjeh(t("deleteSuccess"));
      router.refresh();
    } catch {
      postaviGresku(t("deleteFailed"));
    } finally {
      postaviBriseId(null);
    }
  }

  return (
    <Kartica naslov={t("title")}>
      <div className="space-y-4">
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

        {prilozi.length === 0 ? (
          <p className="text-sm text-tekst-slab">
            {t("empty")}
          </p>
        ) : (
          <ul className="divide-y divide-rub">
            {prilozi.map((prilog) => (
              <li
                key={prilog.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">
                    {prilog.naziv}
                  </p>

                  <p className="mt-1 text-xs text-tekst-slab">
                    {(
                      prilog.velicina / 1024
                    ).toLocaleString(locale, {
                      maximumFractionDigits: 1,
                    })}{" "}
                    KB
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={`/api/datoteke/${prilog.id}?locale=${encodeURIComponent(locale)}`}
                    className="text-sm font-medium underline underline-offset-4 hover:opacity-70"
                  >
                    {t("download")}
                  </a>

                  {mozeUpravljati && (
                    <Gumb
                      type="button"
                      varijanta="opasni"
                      disabled={salje || briseId !== null}
                      onClick={() => void ukloniPrilog(prilog)}
                    >
                      {briseId === prilog.id
                        ? t("deleting")
                        : t("deleteButton")}
                    </Gumb>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {mozeUpravljati && (
          <form
            onSubmit={(event) => void dodajPrilog(event)}
            className="space-y-3 border-t border-rub pt-4"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">
                {t("fileField")}
              </span>

              <input
                ref={unosDatoteke}
                type="file"
                name="datoteka"
                required
                accept=".txt,.md,.c,.h,.cpp,.hpp,.py,.java,.js,.ts,.pdf,.zip,.png,.jpg"
                disabled={salje || briseId !== null}
                className="block w-full rounded-md border border-rub bg-povrsina px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-pozadina file:px-3 file:py-1"
              />
            </label>

            <p className="text-xs text-tekst-slab">
              {t("fileHint")}
            </p>

            <Gumb
              type="submit"
              disabled={salje || briseId !== null}
            >
              {salje
                ? t("uploading")
                : t("uploadButton")}
            </Gumb>
          </form>
        )}
      </div>
    </Kartica>
  );
}