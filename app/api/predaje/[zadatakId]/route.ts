
import { sql } from "kysely";
import { createTranslator } from "next-intl";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { jezikObrasca } from "@/i18n/obrazac";
import en from "@/messages/en.json";
import hr from "@/messages/hr.json";
import { dohvatiProfil, upit } from "@/lib/auth/guard";
import {
  GreskaAplikacije,
  porukaGreske,
} from "@/lib/http/greske";
import type { Prevoditelj } from "@/lib/i18n/prevoditelj";
import {
  GreskaProvjereDatoteke,
  MAX_VELICINA_DATOTEKE,
  provjeriDatoteku,
} from "@/lib/datoteke/provjera";
import {
  obrisi,
  spremi,
} from "@/lib/datoteke/spremiste";

type Jezik = "hr" | "en";
type Namespace = "errors" | "submissionUpload";

type RezultatPredaje = {
  predaja_id: string;
  verzija: number;
  uklonjene_putanje: string[];
};

const MAX_BROJ_DATOTEKA = 5;

// Pet datoteka od 20 MiB i dodatnih 1 MiB za multipart podatke.
const MAX_VELICINA_ZAHTJEVA =
  MAX_BROJ_DATOTEKA * MAX_VELICINA_DATOTEKE + 1024 * 1024;

function napraviPrevoditelj(
  jezik: Jezik,
  namespace: Namespace,
): Prevoditelj {
  const poruke = jezik === "en" ? en : hr;
  const t = createTranslator({
    locale: jezik,
    messages: poruke,
  });

  return (kljuc, vrijednosti) =>
    (t as unknown as Prevoditelj)(
      `${namespace}.${kljuc}`,
      vrijednosti,
    );
}

/**
 * Prije parsiranja tijela zahtjeva još ne znamo vrijednost polja
 * locale. Za rane odgovore zato koristimo zadani jezik aplikacije.
 */
function raniPrevoditelj(namespace: Namespace): Prevoditelj {
  return napraviPrevoditelj("hr", namespace);
}

function jsonGreska(poruka: string, status: number): Response {
  return Response.json({ greska: poruka }, { status });
}

function procitajPolje(
  forma: FormData,
  naziv: string,
  maksimum: number,
  kljucPredugogPolja: "textTooLong" | "linkTooLong",
): string | null {
  const vrijednost = forma.get(naziv);

  if (vrijednost === null) {
    return null;
  }

  if (typeof vrijednost !== "string") {
    throw new GreskaAplikacije("invalidBody");
  }

  const tekst = vrijednost.trim();

  if (Array.from(tekst).length > maksimum) {
    throw new GreskaAplikacije(kljucPredugogPolja);
  }

  return tekst || null;
}

function siguranNazivDatoteke(naziv: string): string {
  const siguran = naziv
    .replace(/[\\/\u0000-\u001f\u007f]/g, "_")
    .trim()
    .slice(0, 255);

  if (!siguran) {
    throw new GreskaAplikacije("invalidFilename");
  }

  return siguran;
}

function porukaValidacije(
  greska: unknown,
  t: Prevoditelj,
): string {
  if (greska instanceof GreskaAplikacije) {
    return t(greska.kljuc, greska.vrijednosti);
  }

  if (greska instanceof GreskaProvjereDatoteke) {
    return t(greska.kljuc);
  }

  return t("invalidBody");
}

function jeRezultatPredaje(
  vrijednost: unknown,
): vrijednost is RezultatPredaje {
  if (
    typeof vrijednost !== "object" ||
    vrijednost === null
  ) {
    return false;
  }

  const rezultat = vrijednost as Record<string, unknown>;

  return (
    typeof rezultat.predaja_id === "string" &&
    typeof rezultat.verzija === "number" &&
    Number.isInteger(rezultat.verzija) &&
    Array.isArray(rezultat.uklonjene_putanje) &&
    rezultat.uklonjene_putanje.every(
      (putanja): putanja is string =>
        typeof putanja === "string",
    )
  );
}

function statusGreske(greska: unknown): number {
  const kod =
    typeof greska === "object" &&
    greska !== null &&
    "code" in greska &&
    typeof greska.code === "string"
      ? greska.code
      : undefined;

  switch (kod) {
    case "42501":
      return 403;
    case "P0001":
    case "23514":
      return 400;
    case "23505":
    case "23P01":
      return 409;
    default:
      return 500;
  }
}

/**
 * Čišćenje ne smije prekinuti odgovor nakon uspješne transakcije.
 * Eventualni neuspjeh bilježi se za naknadnu provjeru.
 */
async function sigurnoObrisiPutanje(
  putanje: string[],
): Promise<void> {
  for (const putanja of putanje) {
    try {
      await obrisi(putanja);
    } catch (greska) {
      console.error(
        "Nije moguće obrisati datoteku:",
        putanja,
        greska,
      );
    }
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ zadatakId: string }> },
) {
  const tRaniUnos = raniPrevoditelj("submissionUpload");
  const tRaneGreske = raniPrevoditelj("errors");

  // Provjera origin-a prije čitanja tijela zahtjeva.
  const origin = request.headers.get("origin");

  if (!origin || origin !== request.nextUrl.origin) {
    return jsonGreska(tRaniUnos("invalidOrigin"), 403);
  }

  // Duljina mora biti poznata prije poziva request.formData().
  const contentLength = request.headers.get("content-length");

  if (contentLength === null) {
    return jsonGreska(tRaniUnos("missingContentLength"), 411);
  }

  if (!/^\d+$/.test(contentLength)) {
    return jsonGreska(tRaniUnos("invalidBody"), 400);
  }

  const velicinaZahtjeva = Number(contentLength);

  if (!Number.isSafeInteger(velicinaZahtjeva)) {
    return jsonGreska(tRaniUnos("invalidBody"), 400);
  }

  if (velicinaZahtjeva > MAX_VELICINA_ZAHTJEVA) {
    return jsonGreska(tRaniUnos("requestTooLarge"), 413);
  }

  const contentType = request.headers.get("content-type");

  if (
    !contentType ||
    !/^multipart\/form-data(?:\s*;|$)/i.test(contentType)
  ) {
    return jsonGreska(tRaniUnos("multipartRequired"), 415);
  }

  const { zadatakId } = await context.params;
  const provjeraId = z.uuid().safeParse(zadatakId);

  if (!provjeraId.success) {
    return jsonGreska(tRaniUnos("invalidBody"), 400);
  }

  // Autentikacija prije parsiranja multipart sadržaja.
  let profil: Awaited<ReturnType<typeof dohvatiProfil>>;

  try {
    profil = await dohvatiProfil();
  } catch (greska) {
    return jsonGreska(
      porukaGreske(greska, tRaneGreske),
      statusGreske(greska),
    );
  }

  if (!profil) {
    return jsonGreska(tRaniUnos("signInRequired"), 401);
  }

  if (profil.moraPromijenitiLozinku) {
    return jsonGreska(tRaniUnos("mustChangePassword"), 403);
  }

  if (!profil.student) {
    return jsonGreska(tRaniUnos("studentsOnly"), 403);
  }

  // RLS odlučuje smije li student pristupiti zadatku.
  let zadatak: { kolegij_id: string } | undefined;

  try {
    zadatak = await upit(async (tx) =>
      tx
        .selectFrom("zadatak")
        .select("kolegij_id")
        .where("id", "=", zadatakId)
        .executeTakeFirst(),
    );
  } catch (greska) {
    return jsonGreska(
      porukaGreske(greska, tRaneGreske),
      statusGreske(greska),
    );
  }

  if (!zadatak) {
    return jsonGreska(tRaniUnos("assignmentUnavailable"), 404);
  }

  let forma: FormData;

  try {
    forma = await request.formData();
  } catch {
    return jsonGreska(tRaniUnos("invalidBody"), 400);
  }

  // Za sve odgovore nakon parsiranja koristimo jezik polja locale.
  const jezik = jezikObrasca(forma) as Jezik;
  const tUnos = napraviPrevoditelj(jezik, "submissionUpload");
  const tGreske = napraviPrevoditelj(jezik, "errors");

  let tekst: string | null;
  let link: string | null;
  let datoteke: File[];

  // Prvo provjeravamo sva polja i sve datoteke.
  // Nijedna datoteka još nije zapisana na disk.
  try {
    tekst = procitajPolje(
      forma,
      "tekst",
      20_000,
      "textTooLong",
    );

    link = procitajPolje(
      forma,
      "link",
      2_000,
      "linkTooLong",
    );

    if (link) {
      let url: URL;

      try {
        url = new URL(link);
      } catch {
        throw new GreskaAplikacije("invalidLink");
      }

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new GreskaAplikacije("invalidLink");
      }
    }

    datoteke = [];

    for (const stavka of forma.getAll("datoteke")) {
      if (typeof stavka === "string") {
        throw new GreskaAplikacije("invalidFileField");
      }

      // Preglednik može poslati prazno polje za odabir datoteke.
      if (stavka.name === "" && stavka.size === 0) {
        continue;
      }

      datoteke.push(stavka);
    }

    if (datoteke.length > MAX_BROJ_DATOTEKA) {
      throw new GreskaAplikacije("tooManyFiles");
    }

    if (!tekst && !link && datoteke.length === 0) {
      throw new GreskaAplikacije("contentRequired");
    }
  } catch (greska) {
    return jsonGreska(porukaValidacije(greska, tUnos), 400);
  }

  const provjereneDatoteke: Array<{
    naziv: string;
    bajtovi: Uint8Array;
    mimeTip: string;
  }> = [];

  // Potvrđujemo sadržaj i format svake datoteke prije zapisivanja.
  try {
    for (const datoteka of datoteke) {
      const provjerena = await provjeriDatoteku(datoteka);

      provjereneDatoteke.push({
        naziv: siguranNazivDatoteke(datoteka.name),
        bajtovi: provjerena.bajtovi,
        mimeTip: provjerena.mimeTip,
      });
    }
  } catch (greska) {
    return jsonGreska(porukaValidacije(greska, tUnos), 400);
  }

  const novePutanje: string[] = [];
  let transakcijaUspjela = false;

  try {
    const metapodaci: Array<{
      putanja: string;
      naziv: string;
      velicina: number;
      mime: string;
      sha256: string;
    }> = [];

    // Tek sada zapisujemo datoteke na disk.
    for (const datoteka of provjereneDatoteke) {
      const spremljena = await spremi(datoteka.bajtovi, {
        kolegijId: zadatak.kolegij_id,
        zadatakId,
        vlasnik: profil.korisnikId,
      });

      novePutanje.push(spremljena.putanja);

      metapodaci.push({
        putanja: spremljena.putanja,
        naziv: datoteka.naziv,
        velicina: spremljena.velicina,
        mime: datoteka.mimeTip,
        sha256: spremljena.sha256,
      });
    }

    // SQL funkcija i sve povezane promjene izvode se
    // u transakciji prijavljenog korisnika.
    const rezultat = await upit(async (tx) => {
      const odgovor = await sql<{ rezultat: unknown }>`
        select private.predaj_zadatak(
          ${zadatakId}::uuid,
          ${tekst}::text,
          ${link}::text,
          ${JSON.stringify(metapodaci)}::jsonb
        ) as rezultat
      `.execute(tx);

      const red = odgovor.rows[0];

      if (!red || !jeRezultatPredaje(red.rezultat)) {
        throw new GreskaAplikacije("tryAgain");
      }

      return red.rezultat;
    });

    // Nakon uspješne transakcije nove datoteke ne brišemo.
    transakcijaUspjela = true;

    // SQL vraća samo putanje datoteka koje se više ne koriste.
    await sigurnoObrisiPutanje(rezultat.uklonjene_putanje);

    return Response.json({
      predaja_id: rezultat.predaja_id,
      verzija: rezultat.verzija,
    });
  } catch (greska) {
    // Ako transakcija nije uspjela, uklanjamo datoteke
    // koje je ova HTTP operacija upravo zapisala.
    if (!transakcijaUspjela) {
      await sigurnoObrisiPutanje(novePutanje);
    }

    return jsonGreska(
      porukaGreske(greska, tGreske),
      statusGreske(greska),
    );
  }
}