
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  GumbLink,
  Kartica,
  Naslov,
  Oznaka,
} from "@/components/ui";

import {
  upit,
  zahtijevajOsoblje,
} from "@/lib/auth/guard";
import {
  formatDatumVrijeme,
  formatVrijeme,
  isoDatum,
} from "@/lib/domena/vrijeme";
import { grupeSAsistentima } from "@/lib/servisi/kolegij";
import { predajeZadatka } from "@/lib/servisi/predaje-zadatka";
import { priloziZadatka } from "@/lib/servisi/prilozi-zadatka";
import { zadatakKolegija } from "@/lib/servisi/zadaci";

import {
  FormaObjave,
  FormaUrediZadatka,
} from "./forma";
import { PredajeZadatkaTablica } from "./predaje-tablica";
import { PriloziZadatkaKartica } from "./prilozi-kartica";

export default async function DetaljiZadatka({
  params,
  searchParams,
}: PageProps<"/[locale]/nastava/[kolegijId]/zadaci/[zadatakId]">) {
  const { kolegijId, zadatakId } = await params;
  const sp = await searchParams;

  // Provjeravamo ID prije izvođenja upita prema bazi.
  if (!z.uuid().safeParse(zadatakId).success) {
    notFound();
  }

  // Pristup imaju nastavnik i ovlašteni asistent.
  const uloga = await zahtijevajOsoblje(kolegijId);

  const rezultat = await upit(async (tx) => {
    const zadatak = await zadatakKolegija(
      tx,
      kolegijId,
      zadatakId,
    );

    if (!zadatak) {
      return null;
    }

    // Dohvaćamo priloge vidljive trenutnom korisniku.
    const prilozi = await priloziZadatka(
      tx,
      zadatakId,
    );

    // Samo nastavnik treba podatke za obrazac uređivanja.
    const grupe =
      uloga === "nastavnik"
        ? await grupeSAsistentima(tx, kolegijId)
        : [];

    // Predaje postoje samo za objavljene zadatke.
    const predaje =
      zadatak.objavljen_at === null
        ? []
        : await predajeZadatka(
            tx,
            kolegijId,
            zadatakId,
          );

    return {
      zadatak,
      grupe,
      predaje,
      prilozi,
    };
  });

  if (!rezultat) {
    notFound();
  }

  const {
    zadatak,
    grupe,
    predaje,
    prilozi,
  } = rezultat;

  const t = await getTranslations(
    "teacherAssignmentForm",
  );

  const tLista = await getTranslations(
    "teacherAssignments",
  );

  const locale = await getLocale();
  const jezik = locale === "en" ? "en" : "hr";

  const metode = zadatak.nacini_predaje.map((metoda) => {
    if (metoda === "datoteka") {
      return t("methods.datoteka");
    }

    if (metoda === "link") {
      return t("methods.link");
    }

    if (metoda === "tekst") {
      return t("methods.tekst");
    }

    return metoda;
  });

  return (
    <div className="space-y-4">
      <Naslov
        podnaslov={t("details")}
        akcije={
          <GumbLink
            href={`/nastava/${kolegijId}/zadaci`}
          >
            {t("backToList")}
          </GumbLink>
        }
      >
        {zadatak.naslov}
      </Naslov>

      {/* Detalji zadatka */}
      <Kartica naslov={t("details")}>
        <div className="space-y-4">
          <div>
            {zadatak.objavljen_at === null ? (
              <Oznaka ton="upozorenje">
                {tLista("draft")}
              </Oznaka>
            ) : (
              <Oznaka ton="uspjeh">
                {tLista("published")}
              </Oznaka>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium">
              {t("fields.description")}
            </h3>

            <p className="mt-1 whitespace-pre-wrap text-sm">
              {zadatak.opis || "—"}
            </p>
          </div>

          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium">
                {t("fields.deadlineDate")}
              </dt>

              <dd className="mt-1">
                {formatDatumVrijeme(
                  zadatak.rok,
                  jezik,
                )}
              </dd>
            </div>

            <div>
              <dt className="font-medium">
                {t("fields.maxPoints")}
              </dt>

              <dd className="mt-1">
                {Number(zadatak.max_bodova)}
              </dd>
            </div>

            <div>
              <dt className="font-medium">
                {t("methodsTitle")}
              </dt>

              <dd className="mt-1">
                {metode.join(", ")}
              </dd>
            </div>

            <div>
              <dt className="font-medium">
                {t("audience")}
              </dt>

              <dd className="mt-1">
                {zadatak.za_cijeli_kolegij
                  ? t("wholeCourse")
                  : zadatak.grupe
                      .map((grupa) => grupa.naziv)
                      .join(", ") || "—"}
              </dd>
            </div>

            <div>
              <dt className="font-medium">
                {t("allowLate")}
              </dt>

              <dd className="mt-1">
                {zadatak.dopusti_kasnu_predaju
                  ? "✓"
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </Kartica>

      {/* Prilozi zadatka: pregled, preuzimanje i upravljanje */}
      <PriloziZadatkaKartica
        zadatakId={zadatakId}
        prilozi={prilozi.map((prilog) => ({
          id: prilog.id,
          naziv: prilog.naziv,
          velicina: Number(prilog.velicina),
        }))}
        mozeUpravljati={uloga === "nastavnik"}
      />

      {/* Pregled predaja za nastavnika i asistenta */}
      <PredajeZadatkaTablica
        kolegijId={kolegijId}
        zadatakId={zadatakId}
        objavljen={zadatak.objavljen_at !== null}
        predaje={predaje}
        searchParams={sp}
        jezik={jezik}
      />

      {/* Uređivanje i objava dostupni su samo nastavniku */}
      {uloga === "nastavnik" && (
        <>
          <Kartica naslov={t("editTitle")}>
            <FormaUrediZadatka
              kolegijId={kolegijId}
              zadatakId={zadatakId}
              zadatak={{
                naslov: zadatak.naslov,
                opis: zadatak.opis,
                datum: isoDatum(zadatak.rok),
                vrijeme: formatVrijeme(zadatak.rok),
                maxBodova: String(
                  zadatak.max_bodova,
                ),
                naciniPredaje:
                  zadatak.nacini_predaje,
                dopustiKasnuPredaju:
                  zadatak.dopusti_kasnu_predaju,
                zaCijeliKolegij:
                  zadatak.za_cijeli_kolegij,
                grupaIds: zadatak.grupe.map(
                  (grupa) => grupa.id,
                ),
              }}
              grupe={grupe.map(
                ({ id, naziv, tip }) => ({
                  id,
                  naziv,
                  tip,
                }),
              )}
            />
          </Kartica>

          {zadatak.objavljen_at === null && (
            <Kartica naslov={t("publish")}>
              <FormaObjave
                kolegijId={kolegijId}
                zadatakId={zadatakId}
              />
            </Kartica>
          )}
        </>
      )}
    </div>
  );
}