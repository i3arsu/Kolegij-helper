
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { createTranslator } from "next-intl";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { dohvatiProfil, ulogaNaKolegiju, upit } from "@/lib/auth/guard";
import en from "@/messages/en.json";
import hr from "@/messages/hr.json";
import { jezikObrasca } from "@/i18n/obrazac";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Jezik = "hr" | "en";
type Namespace = "errors" | "assignmentAttachments";

const MAX_VELICINA_ZAHTJEVA =
  MAX_VELICINA_DATOTEKE + 1024 * 1024;

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

function jsonGreska(
  poruka: string,
  status: number,
): Response {
  return Response.json({ greska: poruka }, { status });
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

async function sigurnoObrisiPutanju(
  putanja: string,
): Promise<void> {
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

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ zadatakId: string }>;
  },
) {
  const tRaniUnos = napraviPrevoditelj(
    "hr",
    "assignmentAttachments",
  );

  const tRaneGreske = napraviPrevoditelj(
    "hr",
    "errors",
  );

  // Provjera izvora zahtjeva prije čitanja tijela.
  const origin = request.headers.get("origin");

  if (!origin || origin !== request.nextUrl.origin) {
    return jsonGreska(
      tRaniUnos("invalidOrigin"),
      403,
    );
  }

  // Provjeravamo veličinu prije parsiranja datoteke.
  const contentLength = request.headers.get("content-length");

  if (contentLength === null) {
    return jsonGreska(
      tRaniUnos("missingContentLength"),
      411,
    );
  }

  if (!/^\d+$/.test(contentLength)) {
    return jsonGreska(
      tRaniUnos("invalidBody"),
      400,
    );
  }

  const velicinaZahtjeva = Number(contentLength);

  if (!Number.isSafeInteger(velicinaZahtjeva)) {
    return jsonGreska(
      tRaniUnos("invalidBody"),
      400,
    );
  }

  if (velicinaZahtjeva > MAX_VELICINA_ZAHTJEVA) {
    return jsonGreska(
      tRaniUnos("requestTooLarge"),
      413,
    );
  }

  const contentType = request.headers.get("content-type");

  if (
    !contentType ||
    !/^multipart\/form-data(?:\s*;|$)/i.test(contentType)
  ) {
    return jsonGreska(
      tRaniUnos("multipartRequired"),
      415,
    );
  }

  const { zadatakId } = await context.params;

  if (!z.uuid().safeParse(zadatakId).success) {
    return jsonGreska(
      tRaniUnos("invalidBody"),
      400,
    );
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
    return jsonGreska(
      tRaniUnos("signInRequired"),
      401,
    );
  }

  if (profil.moraPromijenitiLozinku) {
    return jsonGreska(
      tRaniUnos("mustChangePassword"),
      403,
    );
  }

  // Samo račun osoblja može upravljati nastavnim prilozima.
  if (!profil.osoblje) {
    return jsonGreska(
      tRaniUnos("assignmentUnavailable"),
      404,
    );
  }

  let zadatak:
    | { id: string; kolegij_id: string }
    | undefined;

  try {
    zadatak = await upit(async (tx) =>
      tx
        .selectFrom("zadatak")
        .select(["id", "kolegij_id"])
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
    return jsonGreska(
      tRaniUnos("assignmentUnavailable"),
      404,
    );
  }

  // Asistent ne može dodavati nastavne priloge.
  let uloga: Awaited<ReturnType<typeof ulogaNaKolegiju>>;

  try {
    uloga = await ulogaNaKolegiju(zadatak.kolegij_id);
  } catch (greska) {
    return jsonGreska(
      porukaGreske(greska, tRaneGreske),
      statusGreske(greska),
    );
  }

  if (uloga !== "nastavnik") {
    return jsonGreska(
      tRaniUnos("assignmentUnavailable"),
      404,
    );
  }

  let forma: FormData;

  try {
    forma = await request.formData();
  } catch {
    return jsonGreska(
      tRaniUnos("invalidBody"),
      400,
    );
  }

  const jezik = jezikObrasca(forma) as Jezik;

  const tUnos = napraviPrevoditelj(
    jezik,
    "assignmentAttachments",
  );

  const tGreske = napraviPrevoditelj(
    jezik,
    "errors",
  );

  // Prihvaćamo točno jednu odabranu datoteku.
  const stavke = forma.getAll("datoteka");

  if (
    stavke.length !== 1 ||
    typeof stavke[0] === "string"
  ) {
    return jsonGreska(
      tUnos("fileRequired"),
      400,
    );
  }

  const datoteka = stavke[0];

  if (datoteka.name === "" && datoteka.size === 0) {
    return jsonGreska(
      tUnos("fileRequired"),
      400,
    );
  }

  let naziv: string;
  let provjerena: Awaited<
    ReturnType<typeof provjeriDatoteku>
  >;

  // Provjeravamo naziv, veličinu, ekstenziju i sadržaj.
  // Još ne zapisujemo ništa na disk.
  try {
    naziv = siguranNazivDatoteke(datoteka.name);
    provjerena = await provjeriDatoteku(datoteka);
  } catch (greska) {
    return jsonGreska(
      porukaValidacije(greska, tUnos),
      400,
    );
  }

  let novaPutanja: string | null = null;
  let transakcijaUspjela = false;

  try {
    const spremljena = await spremi(
      provjerena.bajtovi,
      {
        kolegijId: zadatak.kolegij_id,
        zadatakId,
        vlasnik: profil.korisnikId,
      },
    );

    novaPutanja = spremljena.putanja;

    // Generiramo ID unaprijed. Tako ne ovisimo o RETURNING,
    // koji bi također mogao aktivirati provjeru SELECT politike.
    const datotekaId = randomUUID();

    // Metapodaci i veza sa zadatkom upisuju se unutar
    // jedne transakcije prijavljenog korisnika.
    const rezultat = await upit(async (tx) => {
      // Privremena dijagnostika RLS-a.
      // Možemo je ukloniti nakon što riješimo problem.

      // Prvi upis: metapodaci bez RETURNING i bez SELECT-a.
      await sql`
        insert into datoteka (
          id,
          putanja,
          naziv,
          velicina,
          mime,
          sha256,
          vlasnik
        )
        values (
          ${datotekaId}::uuid,
          ${spremljena.putanja},
          ${naziv},
          ${spremljena.velicina},
          ${provjerena.mimeTip},
          ${spremljena.sha256},
          ${profil.korisnikId}::uuid
        )
      `.execute(tx);

      // Drugi upis: povezujemo datoteku sa zadatkom.
      await sql`
        insert into zadatak_prilog (
          zadatak_id,
          datoteka_id
        )
        values (
          ${zadatakId}::uuid,
          ${datotekaId}::uuid
        )
      `.execute(tx);

      return { id: datotekaId };
    });

    transakcijaUspjela = true;

    return Response.json({
      id: rezultat.id,
      naziv,
      mime: provjerena.mimeTip,
      velicina: spremljena.velicina,
    });
  } catch (greska) {
    // Detalji privremeni za otkriti točno mjesto pogreške.
    const detalji =
      greska instanceof Error
        ? (greska as Error & {
            code?: string;
            detail?: string;
            table?: string;
            schema?: string;
            constraint?: string;
            hint?: string;
          })
        : undefined;

    console.error(
      "[POST prilozi] Greška pri spremanju priloga:",
      {
        message:
          greska instanceof Error
            ? greska.message
            : String(greska),
        code: detalji?.code,
        detail: detalji?.detail,
        table: detalji?.table,
        schema: detalji?.schema,
        constraint: detalji?.constraint,
        hint: detalji?.hint,
      },
    );

    // Ako transakcija nije uspjela, uklanjamo fizičku datoteku.
    if (!transakcijaUspjela && novaPutanja) {
      await sigurnoObrisiPutanju(novaPutanja);
    }

    return jsonGreska(
      porukaGreske(greska, tGreske),
      statusGreske(greska),
    );
  }
}