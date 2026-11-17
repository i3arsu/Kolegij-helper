
import { expect, test } from "@playwright/test";
import pg, { type Client } from "pg";

import { urlBaze } from "../../lib/db/url";
import { prijaviStudenta } from "./pomocnici";

// ======================================================
// CONFIGURACIÓN
// ======================================================

const STUDENT_EMAIL = "ivan.horvat@student.unipu.test";
const STUDENT_B_EMAIL = "klara.saric@student.unipu.test";

// ======================================================
// TIPOS
// ======================================================

type ResursiSeedani = {
  kolegijId: string;
  z1Id: string;
  z3Id: string;
  predajaId: string;
  datotekaId: string;
};

type StanjeZadatka = {
  predaje: number;
  verzije: number;
  datoteke: number;
};

// ======================================================
// BASE DE DATOS: SOLO LECTURA
// ======================================================

async function koristiOwner<T>(
  funkcija: (klijent: Client) => Promise<T>,
): Promise<T> {
  const klijent = new pg.Client({
    connectionString: urlBaze("app_owner"),
  });

  await klijent.connect();

  try {
    return await funkcija(klijent);
  } finally {
    await klijent.end();
  }
}

/**
 * Obtiene dinámicamente los identificadores creados por el seed.
 *
 * Ivan tiene una entrega aceptada de Z1 con un PDF.
 * Z3 está asignado a V1 y V2, pero no a Klara (V3).
 */
async function dohvatiResurseSeedane(): Promise<ResursiSeedani> {
  return koristiOwner(async (klijent) => {
    // 1. Encontramos la entrega y el archivo de Ivan en Z1.
    const rezultatIvana = await klijent.query(
      `
        SELECT
          z.kolegij_id,
          z.id AS z1_id,
          p.id AS predaja_id,
          d.id AS datoteka_id
        FROM zadatak z
        JOIN predaja p
          ON p.zadatak_id = z.id
        JOIN student s
          ON s.id = p.student_id
        JOIN korisnik k
          ON k.id = s.korisnik_id
        JOIN predaja_verzija pv
          ON pv.predaja_id = p.id
          AND pv.broj = 1
        JOIN predaja_datoteka pd
          ON pd.verzija_id = pv.id
        JOIN datoteka d
          ON d.id = pd.datoteka_id
        WHERE z.naslov = $1
          AND k.email = $2
        LIMIT 1
      `,
      ["Rekurzija", STUDENT_EMAIL],
    );

    const ivan = rezultatIvana.rows[0] as
      | {
          kolegij_id: string;
          z1_id: string;
          predaja_id: string;
          datoteka_id: string;
        }
      | undefined;

    if (!ivan) {
      throw new Error(
        "No se encontró la entrega PDF de Ivan en Z1. Comprueba el seed.",
      );
    }

    // 2. Encontramos Z3 dentro del mismo curso.
    const rezultatZ3 = await klijent.query(
      `
        SELECT id
        FROM zadatak
        WHERE kolegij_id = $1
          AND naslov = $2
        LIMIT 1
      `,
      [ivan.kolegij_id, "Binarna stabla"],
    );

    const z3 = rezultatZ3.rows[0] as
      | { id: string }
      | undefined;

    if (!z3) {
      throw new Error(
        "No se encontró Z3. Comprueba el seed.",
      );
    }

    return {
      kolegijId: ivan.kolegij_id,
      z1Id: ivan.z1_id,
      z3Id: z3.id,
      predajaId: ivan.predaja_id,
      datotekaId: ivan.datoteka_id,
    };
  });
}

/**
 * Cuenta las entregas, versiones y archivos asociados a un ejercicio.
 * Permite comprobar que una petición rechazada no ha modificado la BD.
 */
async function dohvatiStanjeZadatka(
  zadatakId: string,
): Promise<StanjeZadatka> {
  return koristiOwner(async (klijent) => {
    const rezultat = await klijent.query(
      `
        SELECT
          (
            SELECT COUNT(*)::int
            FROM predaja
            WHERE zadatak_id = $1
          ) AS predaje,
          (
            SELECT COUNT(*)::int
            FROM predaja_verzija pv
            JOIN predaja p
              ON p.id = pv.predaja_id
            WHERE p.zadatak_id = $1
          ) AS verzije,
          (
            SELECT COUNT(*)::int
            FROM predaja_datoteka pd
            JOIN predaja_verzija pv
              ON pv.id = pd.verzija_id
            JOIN predaja p
              ON p.id = pv.predaja_id
            WHERE p.zadatak_id = $1
          ) AS datoteke
      `,
      [zadatakId],
    );

    return rezultat.rows[0] as StanjeZadatka;
  });
}

/**
 * Obtiene la URL base desde la configuración de Playwright.
 */
function dohvatiBaseURL(): string {
  const baseURL = test.info().project.use.baseURL;

  if (typeof baseURL !== "string") {
    throw new Error(
      "No se ha configurado baseURL en Playwright.",
    );
  }

  return baseURL;
}

// ======================================================
// TESTS IDOR
// ======================================================

test.describe("IDOR: protección de recursos entre estudiantes", () => {

  // ====================================================
  // PRUEBA 1: DESCARGA DE ARCHIVOS
  // ====================================================

  test(
    "Klara de V3 no puede descargar el archivo de Ivan",
    async ({ page }) => {
      const recursos = await dohvatiResurseSeedane();

      // Iniciamos sesión como estudiante B.
      await prijaviStudenta(page, STUDENT_B_EMAIL);

      const baseURL = dohvatiBaseURL();

      const urlArchivo = new URL(
        `/api/datoteke/${recursos.datotekaId}?locale=hr`,
        baseURL,
      ).toString();

      // Intentamos descargar el archivo perteneciente a Ivan.
      const respuesta = await page.request.get(urlArchivo);

      // La API debe ocultar el recurso inexistente o inaccesible.
      expect(respuesta.status()).toBe(404);
    },
  );

  // ====================================================
  // PRUEBA 2: ACCESO A REVISIONES
  // ====================================================

  test(
    "Klara de V3 no puede acceder a la revisión de Ivan",
    async ({ page }) => {
      const recursos = await dohvatiResurseSeedane();

      // Iniciamos sesión como estudiante B.
      await prijaviStudenta(page, STUDENT_B_EMAIL);

      const urlRevision =
        `/nastava/${recursos.kolegijId}` +
        `/zadaci/${recursos.z1Id}` +
        `/predaje/${recursos.predajaId}`;

      const respuesta = await page.goto(urlRevision);

      // La aplicación puede responder 404 o redirigir
      // al usuario fuera de las rutas del personal.
      const es404 = respuesta?.status() === 404;

      const urlFinal = new URL(page.url());
      const redirigidoFueraDeNastava =
        !urlFinal.pathname.startsWith("/nastava/");

      expect(
        es404 || redirigidoFueraDeNastava,
        `Klara ha podido acceder a ${page.url()}`,
      ).toBe(true);
    },
  );

  // ====================================================
  // PRUEBA 3: ENVÍO A UN EJERCICIO NO ASIGNADO
  // ====================================================

  test(
    "Klara de V3 no puede enviar una entrega a Z3 y la BD permanece intacta",
    async ({ page }) => {
      const recursos = await dohvatiResurseSeedane();

      // Capturamos el estado inicial de Z3.
      const estadoAntes = await dohvatiStanjeZadatka(
        recursos.z3Id,
      );

      // Iniciamos sesión como estudiante B.
      await prijaviStudenta(page, STUDENT_B_EMAIL);

      const baseURL = dohvatiBaseURL();

      const urlPredaje = new URL(
        `/api/predaje/${recursos.z3Id}`,
        baseURL,
      ).toString();

      // Intentamos enviar contenido a un ejercicio
      // que no está asignado al grupo V3.
      const respuesta = await page.request.post(
        urlPredaje,
        {
          headers: {
            origin: new URL(baseURL).origin,
          },
          multipart: {
            locale: "hr",
            tekst: "E2E IDOR: pokušaj neovlaštene predaje.",
          },
        },
      );

      // La petición debe ser rechazada por la API.
      expect(respuesta.ok()).toBe(false);
      expect(respuesta.status()).toBe(404);

      // Volvemos a consultar el estado de Z3.
      const estadoDespues = await dohvatiStanjeZadatka(
        recursos.z3Id,
      );

      // No debe haberse creado ninguna entrega,
      // versión ni relación con archivos.
      expect(estadoDespues).toEqual(estadoAntes);
    },
  );
});
