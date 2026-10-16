
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  dohvatiProfil,
  upit,
} from "@/lib/auth/guard";
import { otvori } from "@/lib/datoteke/spremiste";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParametriRute = {
  params: Promise<{ id: string }>;
};

function jeNedostajucaDatoteka(greska: unknown): boolean {
  return (
    typeof greska === "object" &&
    greska !== null &&
    "code" in greska &&
    greska.code === "ENOENT"
  );
}

function kodiranaPutanjaNaziva(naziv: string): string {
  return encodeURIComponent(naziv).replace(
    /['()*]/g,
    (znak) =>
      `%${znak.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export async function GET(
  _request: NextRequest,
  context: ParametriRute,
): Promise<Response> {
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
      { greska: "Nije moguće provjeriti sesiju." },
      { status: 500 },
    );
  }

  if (!profil) {
    return Response.json(
      { greska: "Prijavite se za preuzimanje datoteke." },
      { status: 401 },
    );
  }

  if (profil.moraPromijenitiLozinku) {
    return Response.json(
      { greska: "Prije nastavka morate promijeniti lozinku." },
      { status: 403 },
    );
  }

  let datoteka;

  try {
    // RLS određuje smije li trenutni korisnik vidjeti zapis.
    // Nedostupan zapis i nepostojeći zapis daju isti odgovor.
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
      { greska: "Nije moguće preuzeti datoteku." },
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
      { greska: "Nije moguće otvoriti datoteku." },
      { status: 500 },
    );
  }

  const tijelo = Readable.toWeb(stream) as ReadableStream<Uint8Array>;

  return new Response(tijelo, {
    status: 200,
    headers: {
      "Content-Type": datoteka.mime || "application/octet-stream",
      "Content-Length": String(datoteka.velicina),
      "Content-Disposition":
        `attachment; filename="download"; filename*=UTF-8''${kodiranaPutanjaNaziva(datoteka.naziv)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}