
import { createTranslator } from "next-intl";
import { sql } from "kysely";
import type { NextRequest } from "next/server";
import { z } from "zod";

import hr from "@/messages/hr.json";
import en from "@/messages/en.json";
import { dohvatiProfil, upit } from "@/lib/auth/guard";
import { porukaGreske } from "@/lib/http/greske";
import type { Prevoditelj } from "@/lib/i18n/prevoditelj";
import {
  MAX_VELICINA_DATOTEKE,
  provjeriDatoteku,
} from "@/lib/datoteke/provjera";
import {
  obrisi,
  spremi,
} from "@/lib/datoteke/spremiste";

type Jezik = "hr" | "en";

type RezultatPredaje = {
  predaja_id: string;
  verzija: number;
  uklonjene_putanje: string[];
};

const MAX_BROJ_DATOTEKA = 5;

// Granica ukupnog zahtjeva: pet datoteka od 20 MiB
// plus 1 MiB za multipart zaglavlja i ostale podatke.
const MAX_VELICINA_ZAHTJEVA =
  MAX_BROJ_DATOTEKA * MAX_VELICINA_DATOTEKE + 1024 * 1024;

const PORUKE = {
  hr: {
    neispravanOrigin: "Neispravan zahtjev.",
    prevelikZahtjev: "Zahtjev je prevelik.",
    neispravnoTijelo: "Neispravan sadržaj zahtjeva.",
    multipart: "Zahtjev mora biti multipart/form-data.",
    nemaSesije: "Prijavite se za predaju zadatka.",
    promjenaLozinke: "Prije predaje morate promijeniti lozinku.",
    nijeStudent: "Predaju zadatka mogu poslati samo studenti.",
    zadatakNijeDostupan: "Zadatak nije pronađen ili nemate pristup.",
    previseDatoteka: "Možete priložiti najviše 5 datoteka.",
    nemaSadrzaja: "Unesite tekst, poveznicu ili priložite datoteku.",
    tekstPredug: "Tekst ne smije biti duži od 20.000 znakova.",
    poveznicaPreduga: "Poveznica ne smije biti duža od 2.000 znakova.",
    neispravnaPoveznica: "Unesite valjanu HTTP ili HTTPS poveznicu.",
    neispravnoPoljeDatoteke: "Neispravno polje datoteke.",
    neispravanNaziv: "Naziv datoteke nije valjan.",
  },
  en: {
    neispravanOrigin: "Invalid request origin.",
    prevelikZahtjev: "The request is too large.",
    neispravnoTijelo: "Invalid request content.",
    multipart: "The request must use multipart/form-data.",
    nemaSesije: "Sign in to submit the assignment.",
    promjenaLozinke: "You must change your password before submitting.",
    nijeStudent: "Only students can submit assignments.",
    zadatakNijeDostupan: "Assignment not found or access denied.",
    previseDatoteka: "You can attach at most 5 files.",
    nemaSadrzaja: "Provide text, a link, or at least one file.",
    tekstPredug: "Text cannot exceed 20,000 characters.",
    poveznicaPreduga: "The link cannot exceed 2,000 characters.",
    neispravnaPoveznica: "Enter a valid HTTP or HTTPS link.",
    neispravnoPoljeDatoteke: "Invalid file field.",
    neispravanNaziv: "The file name is invalid.",
  },
} as const;

function odaberiJezik(request: NextRequest): Jezik {
  const kolacic = request.cookies.get("NEXT_LOCALE")?.value;

  if (kolacic === "hr" || kolacic === "en") {
    return kolacic;
  }

  const prihvaceniJezik = request.headers
    .get("accept-language")
    ?.split(",")[0]
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();

  return prihvaceniJezik === "en" ||
    prihvaceniJezik?.startsWith("en-")
    ? "en"
    : "hr";
}

function napraviPrevoditelj(jezik: Jezik): Prevoditelj {
  const poruke = jezik === "en" ? en : hr;
  const t = createTranslator({ locale: jezik, messages: poruke });

  return (kljuc, vrijednosti) =>
    (t as unknown as Prevoditelj)(
      `errors.${kljuc}`,
      vrijednosti,
    );
}

function jsonGreska(poruka: string, status: number): Response {
  return Response.json({ greska: poruka }, { status });
}

function procitajPolje(
  forma: FormData,
  naziv: string,
  maksimum: number,
  porukaPredugogPolja: string,
): string | null {
  const vrijednost = forma.get(naziv);

  if (vrijednost === null) {
    return null;
  }

  if (typeof vrijednost !== "string") {
    throw new Error(PORUKE.hr.neispravnoTijelo);
  }

  const tekst = vrijednost.trim();

  if (Array.from(tekst).length > maksimum) {
    throw new Error(porukaPredugogPolja);
  }

  return tekst || null;
}

function siguranNazivDatoteke(naziv: string): string {
  const siguran = naziv
    .replace(/[\\/\u0000-\u001f\u007f]/g, "_")
    .trim()
    .slice(0, 255);

  if (!siguran) {
    throw new Error(PORUKE.hr.neispravanNaziv);
  }

  return siguran;
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
 * Eventualni neuspjeh brišanja bilježi se za naknadnu provjeru.
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
  const jezik = odaberiJezik(request);
  const poruke = PORUKE[jezik];
  const t = napraviPrevoditelj(jezik);

  // Zahtjev mora potjecati s istog origin-a kao aplikacija.
  const origin = request.headers.get("origin");

  if (!origin || origin !== request.nextUrl.origin) {
    return jsonGreska(poruke.neispravanOrigin, 403);
  }

  // Ograničavamo veličinu zahtjeva prije parsiranja multipart tijela.
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      return jsonGreska(poruke.neispravnoTijelo, 400);
    }

    const velicinaZahtjeva = Number(contentLength);

    if (!Number.isSafeInteger(velicinaZahtjeva)) {
      return jsonGreska(poruke.neispravnoTijelo, 400);
    }

    if (velicinaZahtjeva > MAX_VELICINA_ZAHTJEVA) {
      return jsonGreska(poruke.prevelikZahtjev, 413);
    }
  }

  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("multipart/form-data")
  ) {
    return jsonGreska(poruke.multipart, 415);
  }

  const { zadatakId } = await context.params;
  const provjeraId = z.uuid().safeParse(zadatakId);

  if (!provjeraId.success) {
    return jsonGreska(poruke.neispravnoTijelo, 400);
  }

  // API vraća JSON umjesto preusmjeravanja neprijavljenog korisnika.
  let profil: Awaited<ReturnType<typeof dohvatiProfil>>;

  try {
    profil = await dohvatiProfil();
  } catch (greska) {
    return jsonGreska(
      porukaGreske(greska, t),
      statusGreske(greska),
    );
  }

  if (!profil) {
    return jsonGreska(poruke.nemaSesije, 401);
  }

  if (profil.moraPromijenitiLozinku) {
    return jsonGreska(poruke.promjenaLozinke, 403);
  }

  if (!profil.student) {
    return jsonGreska(poruke.nijeStudent, 403);
  }

  // Dohvaćamo kolegij za sigurnu lokaciju spremanja.
  // RLS i dalje odlučuje smije li prijavljeni student vidjeti zadatak.
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
      porukaGreske(greska, t),
      statusGreske(greska),
    );
  }

  if (!zadatak) {
    return jsonGreska(poruke.zadatakNijeDostupan, 404);
  }

  let forma: FormData;

  try {
    forma = await request.formData();
  } catch {
    return jsonGreska(poruke.neispravnoTijelo, 400);
  }

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
      poruke.tekstPredug,
    );

    link = procitajPolje(
      forma,
      "link",
      2_000,
      poruke.poveznicaPreduga,
    );

    if (link) {
      let url: URL;

      try {
        url = new URL(link);
      } catch {
        throw new Error(poruke.neispravnaPoveznica);
      }

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(poruke.neispravnaPoveznica);
      }
    }

    datoteke = [];

    for (const stavka of forma.getAll("datoteke")) {
      if (typeof stavka === "string") {
        throw new Error(poruke.neispravnoPoljeDatoteke);
      }

      // Preglednik može poslati prazno polje za odabir datoteke.
      if (stavka.name === "" && stavka.size === 0) {
        continue;
      }

      datoteke.push(stavka);
    }

    if (datoteke.length > MAX_BROJ_DATOTEKA) {
      throw new Error(poruke.previseDatoteka);
    }

    if (!tekst && !link && datoteke.length === 0) {
      throw new Error(poruke.nemaSadrzaja);
    }
  } catch (greska) {
    return jsonGreska(
      greska instanceof Error
        ? greska.message
        : poruke.neispravnoTijelo,
      400,
    );
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
    return jsonGreska(
      greska instanceof Error
        ? greska.message
        : poruke.neispravnoTijelo,
      400,
    );
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

    // SQL funkcija i sve povezane promjene izvode se unutar
    // transakcije prijavljenog korisnika.
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
  throw new Error("Neispravan odgovor funkcije predaje.");
}

return red.rezultat;

    });

    // upit() je završio transakciju. Nove datoteke više se
    // ne smiju brisati kao dio naknadnog čišćenja.
    transakcijaUspjela = true;

    // SQL vraća samo putanje datoteka koje više nisu korištene.
    await sigurnoObrisiPutanje(rezultat.uklonjene_putanje);

    return Response.json({
      predaja_id: rezultat.predaja_id,
      verzija: rezultat.verzija,
    });
  } catch (greska) {
    // Ako transakcija nije uspjela, uklanjamo sve datoteke
    // koje je ova HTTP operacija upravo zapisala.
    if (!transakcijaUspjela) {
      await sigurnoObrisiPutanje(novePutanje);
    }

    return jsonGreska(
      porukaGreske(greska, t),
      statusGreske(greska),
    );
  }
}