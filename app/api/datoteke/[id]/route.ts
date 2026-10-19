import { Readable } from "node:stream";
import { createTranslator } from "next-intl";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { jezikIz } from "@/i18n/obrazac";
import en from "@/messages/en.json";
import hr from "@/messages/hr.json";
import {
  dohvatiProfil,
  upit,
} from "@/lib/auth/guard";
import type { Prevoditelj } from "@/lib/i18n/prevoditelj";
import { zaglavljePreuzimanja } from "@/lib/datoteke/zaglavlje-preuzimanja";
import { otvori } from "@/lib/datoteke/spremiste";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Jezik = "hr" | "en";

type ParametriRute = {
  params: Promise<{ id: string }>;
};

function napraviPrevoditelj(jezik: Jezik): Prevoditelj {
  const poruke = jezik === "en" ? en : hr;

  const t = createTranslator({
    locale: jezik,
    messages: poruke,
  });

  return (kljuc, vrijednosti) =>
    (t as unknown as Prevoditelj)(
      `fileDownload.${kljuc}`,
      vrijednosti,
    );
}

function jeNedostajucaDatoteka(greska: unknown): boolean {
  return (
    typeof greska === "object" &&
    greska !== null &&
    "code" in greska &&
    greska.code === "ENOENT"
  );
}

export async function GET(
  request: NextRequest,
  context: ParametriRute,
): Promise<Response> {
  const locale = jezikIz(
    request.nextUrl.searchParams.get("locale"),
  ) as Jezik;

  const t = napraviPrevoditelj(locale);
  const { id } = await context.params;

  // Ne otkrivamo postoji li zapis za nevaljan identifikator.
  if (!z.uuid().safeParse(id).success) {
    return new Response(null, { status: 404 });
  }

  let profil;

  try {
    profil = await dohvatiProfil();
  } catch (greska) {
    console.error("Greška pri provjeri sesije:", greska);

    return Response.json(
      { greska: t("sessionCheckFailed") },
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

  let datoteka;

  try {
    // RLS određuje smije li trenutni korisnik vidjeti zapis.
    // Nedostupan i nepostojeći zapis daju isti odgovor.
    datoteka = await upit((tx) =>
      tx
        .selectFrom("datoteka")
        .select([
          "putanja",
          "naziv",
          "mime",
          "velicina",
        ])
        .where("id", "=", id)
        .executeTakeFirst(),
    );
  } catch (greska) {
    console.error("Greška pri dohvaćanju datoteke:", greska);

    return Response.json(
      { greska: t("downloadFailed") },
      { status: 500 },
    );
  }

  if (!datoteka) {
    return new Response(null, { status: 404 });
  }

  let stream;

  try {
    stream = await otvori(datoteka.putanja);
  } catch (greska) {
    if (jeNedostajucaDatoteka(greska)) {
      return new Response(null, { status: 404 });
    }

    console.error("Greška pri otvaranju datoteke:", greska);

    return Response.json(
      { greska: t("openFailed") },
      { status: 500 },
    );
  }

  const tijelo = Readable.toWeb(
    stream,
  ) as ReadableStream<Uint8Array>;

  return new Response(tijelo, {
    status: 200,
    headers: {
      "Content-Type": datoteka.mime || "application/octet-stream",
      "Content-Length": String(datoteka.velicina),
      "Content-Disposition": zaglavljePreuzimanja(datoteka.naziv),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}