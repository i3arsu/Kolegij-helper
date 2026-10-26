
import { sql } from "kysely";
import { createTranslator } from "next-intl";
import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  dohvatiProfil,
  ulogaNaKolegiju,
  upit,
} from "@/lib/auth/guard";
import { jezikIz } from "@/i18n/obrazac";
import en from "@/messages/en.json";
import hr from "@/messages/hr.json";
import type { Prevoditelj } from "@/lib/i18n/prevoditelj";
import { obrisi } from "@/lib/datoteke/spremiste";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Jezik = "hr" | "en";

type RezultatUklanjanja = {
  pronadjen: boolean;
  putanja: string | null;
};

function napraviPrevoditelj(
  jezik: Jezik,
): Prevoditelj {
  const poruke = jezik === "en" ? en : hr;

  const t = createTranslator({
    locale: jezik,
    messages: poruke,
  });

  return (kljuc, vrijednosti) =>
    (t as unknown as Prevoditelj)(
      `assignmentAttachments.${kljuc}`,
      vrijednosti,
    );
}

function jeRezultatUklanjanja(
  vrijednost: unknown,
): vrijednost is RezultatUklanjanja {
  if (
    typeof vrijednost !== "object" ||
    vrijednost === null
  ) {
    return false;
  }

  const rezultat =
    vrijednost as Record<string, unknown>;

  return (
    typeof rezultat.pronadjen === "boolean" &&
    (
      rezultat.putanja === null ||
      typeof rezultat.putanja === "string"
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

  return kod === "42501" ? 403 : 500;
}

export async function DELETE(
  request: NextRequest,
  context: {
    params: Promise<{
      zadatakId: string;
      datotekaId: string;
    }>;
  },
): Promise<Response> {
  const jezik = jezikIz(
    request.nextUrl.searchParams.get("locale"),
  ) as Jezik;

  const t = napraviPrevoditelj(jezik);

  // Provjera izvora zahtjeva radi zaštite od CSRF zahtjeva.
  const origin = request.headers.get("origin");

  if (!origin || origin !== request.nextUrl.origin) {
    return Response.json(
      { greska: t("invalidOrigin") },
      { status: 403 },
    );
  }

  const { zadatakId, datotekaId } =
    await context.params;

  if (
    !z.uuid().safeParse(zadatakId).success ||
    !z.uuid().safeParse(datotekaId).success
  ) {
    return new Response(null, { status: 404 });
  }

  // Dohvat autentificiranog korisnika.
  let profil;

  try {
    profil = await dohvatiProfil();
  } catch (greska) {
    console.error(
      "[DELETE prilozi] Greška pri provjeri sesije:",
      greska,
    );

    return Response.json(
      { greska: t("deleteFailed") },
      { status: 500 },
    );
  }

  if (!profil) {
    return Response.json(
      { greska: t("signInRequired") },
      { status: 401 },
    );
  }

  if (profil.moraPromijenitiLozinku) {
    return Response.json(
      { greska: t("mustChangePassword") },
      { status: 403 },
    );
  }

  // Samo račun osoblja može pristupiti nastavnim prilozima.
  if (!profil.osoblje) {
    return Response.json(
      { greska: t("assignmentUnavailable") },
      { status: 404 },
    );
  }

  // Provjeravamo postoji li zadatak i dohvaćamo kolegij.
  let zadatak:
    | { kolegij_id: string }
    | undefined;

  try {
    zadatak = await upit(async (tx) =>
      tx
        .selectFrom("zadatak")
        .select("kolegij_id")
        .where("id", "=", zadatakId)
        .executeTakeFirst(),
    );
  } catch (greska) {
    console.error(
      "[DELETE prilozi] Greška pri dohvaćanju zadatka:",
      greska,
    );

    return Response.json(
      { greska: t("deleteFailed") },
      { status: 500 },
    );
  }

  if (!zadatak) {
    return Response.json(
      { greska: t("assignmentUnavailable") },
      { status: 404 },
    );
  }

  // Samo nastavnik može ukloniti nastavni prilog.
  let uloga;

  try {
    uloga = await ulogaNaKolegiju(
      zadatak.kolegij_id,
    );
  } catch (greska) {
    console.error(
      "[DELETE prilozi] Greška pri provjeri uloge:",
      greska,
    );

    return Response.json(
      { greska: t("deleteFailed") },
      { status: 500 },
    );
  }

  if (uloga !== "nastavnik") {
    return Response.json(
      { greska: t("assignmentUnavailable") },
      { status: 404 },
    );
  }

  // Uklanjanje veze izvršava se kroz sigurnu SQL funkciju.
  // Funkcija provjerava ovlasti i čuva datoteke koje se
  // još koriste u drugim zadacima ili studentskim predajama.
  let rezultat: RezultatUklanjanja;

  try {
    rezultat = await upit(async (tx) => {
      const odgovor = await sql<{
        rezultat: unknown;
      }>`
        select private.ukloni_prilog_zadatka(
          ${zadatakId}::uuid,
          ${datotekaId}::uuid
        ) as rezultat
      `.execute(tx);

      const vrijednost =
        odgovor.rows[0]?.rezultat;

      if (!jeRezultatUklanjanja(vrijednost)) {
        throw new Error(
          "Neispravan rezultat uklanjanja priloga.",
        );
      }

      return vrijednost;
    });
  } catch (greska) {
    console.error("[DELETE prilozi]", greska);

    return Response.json(
      { greska: t("deleteFailed") },
      { status: statusGreske(greska) },
    );
  }

  if (!rezultat.pronadjen) {
    return Response.json(
      { greska: t("assignmentUnavailable") },
      { status: 404 },
    );
  }

  // Fizički brišemo datoteku tek nakon uspješne transakcije.
  // Ako se datoteka još koristi, putanja je null i datoteka
  // ostaje sačuvana.
  if (rezultat.putanja) {
    try {
      await obrisi(rezultat.putanja);
    } catch (greska) {
      // Baza je već ažurirana. Ne prijavljujemo klijentu
      // neuspjeh transakcije koja je već uspješno završena.
      console.error(
        "[DELETE prilozi] Nije moguće fizički obrisati datoteku:",
        rezultat.putanja,
        greska,
      );
    }
  }

  return Response.json({ ok: true });
}