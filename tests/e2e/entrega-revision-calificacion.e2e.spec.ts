
import {
  expect,
  test,
  type Page,
} from "@playwright/test";

import path from "node:path";

import {
  dohvatiKolegijId,
  prijaviKorisnika,
  prijaviStudenta,
} from "./pomocnici";

// ======================================================
// CONFIGURACIÓN
// ======================================================

const BASE_URL = "http://localhost:3000";

const STUDENT_EMAIL = "ivan.horvat@student.unipu.test";
const ASSISTANT_EMAIL = "tomislav.kos@unipu.test";
const TEACHER_EMAIL = "marko.peric@unipu.test";

const PDF_PATH = path.resolve(
  process.cwd(),
  "tests/e2e/fixtures/submission.pdf",
);

const KOMENTAR_DORADE =
  "E2E: Molim te da doradiš predaju i pojasniš rješenje.";

const KOMENTAR_OCJENE =
  "E2E: Odlično urađen zadatak. Sve je ispravno.";

const PORUKA_PRIHVACANJA =
  "Predaja je prihvaćena i povratna informacija je spremljena.";

// ======================================================
// FUNCIONES AUXILIARES
// ======================================================

type PodaciZadatka = {
  kolegijId: string;
  zadatakId: string;
  urlZadatka: string;
  urlNastavnika: string;
};

/**
 * Obtiene dinámicamente el ID del ejercicio Binarna stabla.
 */
async function dohvatiZadatakId(
  page: Page,
  kolegijId: string,
): Promise<string> {
  await page.goto(`/moj/${kolegijId}/zadaci`);

  const poveznica = page.getByRole("link", {
    name: /Binarna stabla/i,
  });

  await expect(poveznica).toBeVisible();

  const href = await poveznica.getAttribute("href");

  if (!href) {
    throw new Error(
      "No se pudo obtener el enlace de Binarna stabla.",
    );
  }

  const rezultat = href.match(
    /\/zadaci\/([0-9a-f-]{36})(?:\/|$)/i,
  );

  if (!rezultat) {
    throw new Error(
      `No se pudo extraer el ID del ejercicio: ${href}`,
    );
  }

  return rezultat[1];
}

/**
 * Inicia sesión como estudiante y abre el ejercicio.
 */
async function otvoriZadatak(
  page: Page,
): Promise<PodaciZadatka> {
  // 1. Iniciamos sesión como estudiante.
  await prijaviStudenta(page, STUDENT_EMAIL);

  // 2. Identificamos el curso.
  const kolegijId = await dohvatiKolegijId(page);

  // 3. Identificamos el ejercicio.
  const zadatakId = await dohvatiZadatakId(
    page,
    kolegijId,
  );

  // 4. Construimos las rutas.
  const urlZadatka =
    `/moj/${kolegijId}/zadaci/${zadatakId}`;

  const urlNastavnika =
    `/nastava/${kolegijId}/zadaci/${zadatakId}`;

  // 5. Accedemos al ejercicio.
  await page.goto(urlZadatka);

  await expect(
    page.getByRole("heading", {
      name: "Binarna stabla",
      exact: true,
    }),
  ).toBeVisible();

  return {
    kolegijId,
    zadatakId,
    urlZadatka,
    urlNastavnika,
  };
}

/**
 * Localiza el formulario de entrega de archivos.
 */
function dohvatiFormuPredaje(page: Page) {
  return page
    .locator("form")
    .filter({
      has: page.locator('input[name="datoteke"]'),
    });
}

/**
 * Genera una fecha futura para el plazo de corrección.
 */
function dohvatiBuduciDatum(dani: number): string {
  const datum = new Date();

  datum.setDate(datum.getDate() + dani);

  const godina = datum.getFullYear();
  const mjesec = String(datum.getMonth() + 1).padStart(2, "0");
  const dan = String(datum.getDate()).padStart(2, "0");

  return `${godina}-${mjesec}-${dan}`;
}

/**
 * Escapa una cadena para utilizarla en una expresión regular.
 */
function escapeRegex(vrijednost: string): string {
  return vrijednost.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
}

// ======================================================
// TESTS E2E: ENTREGA Y REVISIÓN
// ======================================================

test.describe.serial("Flujo E2E de entrega", () => {

  // ====================================================
  // PRUEBA 1: VISUALIZACIÓN DEL FORMULARIO
  // ====================================================

  test(
    "Student može otvoriti zadatak i vidi obrazac predaje",
    async ({ page }) => {
      await otvoriZadatak(page);

      const forma = dohvatiFormuPredaje(page);

      await expect(forma).toBeVisible();

      // Comprobamos el selector de archivos.
      const selectorArchivos = forma.locator(
        'input[name="datoteke"]',
      );

      await expect(selectorArchivos).toHaveCount(1);

      await expect(selectorArchivos).toHaveAttribute(
        "type",
        "file",
      );

      // Comprobamos el botón de envío.
      const boton = forma.locator(
        'button[type="submit"]',
      );

      await expect(boton).toBeVisible();
      await expect(boton).toBeEnabled();
    },
  );

  // ====================================================
  // PRUEBA 2: ENTREGA DE LA PRIMERA VERSIÓN
  // ====================================================

  test(
    "Student može predati PDF datoteku",
    async ({ page }) => {
      const { zadatakId } = await otvoriZadatak(page);

      const forma = dohvatiFormuPredaje(page);

      await expect(forma).toBeVisible();

      // Seleccionamos el PDF.
      const selectorArchivos = forma.locator(
        'input[name="datoteke"]',
      );

      await selectorArchivos.setInputFiles(PDF_PATH);

      const nombreArchivo = await selectorArchivos.evaluate(
        (input: HTMLInputElement) =>
          input.files?.[0]?.name,
      );

      expect(nombreArchivo).toBe("submission.pdf");

      // Localizamos el botón.
      const boton = forma.locator(
        'button[type="submit"]',
      );

      await expect(boton).toBeEnabled();

      // Esperamos la respuesta de la API mientras enviamos.
      const [respuestaApi] = await Promise.all([
        page.waitForResponse(
          (response) => {
            const url = new URL(response.url());

            return (
              response.request().method() === "POST" &&
              url.pathname === `/api/predaje/${zadatakId}`
            );
          },
          { timeout: 15_000 },
        ),

        boton.click(),
      ]);

      const cuerpo = await respuestaApi.text();

      expect(
        respuestaApi.ok(),
        `Error HTTP ${respuestaApi.status()}: ${cuerpo}`,
      ).toBeTruthy();

      // Comprobamos que el PDF aparece en el historial.
      await expect(
        page.getByRole("link", {
          name: "submission.pdf",
          exact: true,
        }),
      ).toBeVisible();
    },
  );

  // ====================================================
  // PRUEBA 3: DEVOLUCIÓN POR PARTE DEL ASISTENTE
  // ====================================================

  test(
    "Asistent može vratiti studentsku predaju na doradu",
    async ({ page, browser }) => {
      const {
        urlZadatka,
        urlNastavnika,
      } = await otvoriZadatak(page);

      // Creamos una sesión independiente del asistente.
      const assistantContext = await browser.newContext({
        baseURL: BASE_URL,
        locale: "hr-HR",
      });

      try {
        const assistantPage =
          await assistantContext.newPage();

        await prijaviKorisnika(
          assistantPage,
          ASSISTANT_EMAIL,
        );

        // Accedemos a las entregas del ejercicio.
        await assistantPage.goto(urlNastavnika);

        const redStudenta = assistantPage
          .locator("tr")
          .filter({ hasText: /Horvat/ });

        await expect(redStudenta).toBeVisible();

        const poveznicaPredaje = redStudenta.locator(
          'a[href*="/predaje/"]',
        ).first();

        await expect(poveznicaPredaje).toBeVisible();

        const hrefPredaje =
          await poveznicaPredaje.getAttribute("href");

        if (!hrefPredaje) {
          throw new Error(
            "No se encontró el enlace a la entrega de Ivan.",
          );
        }

        // Abrimos los detalles de la entrega.
        await assistantPage.goto(
          new URL(hrefPredaje, BASE_URL).toString(),
        );

        // Reclamamos la revisión.
        const gumbPreuzmi = assistantPage.getByRole(
          "button",
          { name: /preuzmi/i },
        );

        await expect(gumbPreuzmi).toBeVisible();

        await gumbPreuzmi.click();

        // El formulario aparece cuando el asistente
        // se convierte en responsable de la revisión.
        const poljeKomentara = assistantPage.locator(
          "#komentar-predaje",
        );

        await expect(poljeKomentara).toBeVisible();

        // Introducimos el comentario y el plazo.
        await poljeKomentara.fill(KOMENTAR_DORADE);

        await assistantPage
          .locator('input[name="datum_dorade"]')
          .fill(dohvatiBuduciDatum(3));

        await assistantPage
          .locator('input[name="vrijeme_dorade"]')
          .fill("23:59");

        // Devolvemos la entrega.
        const gumbVrati = assistantPage.locator(
          'button[name="odluka"][value="vraceno_na_doradu"]',
        );

        await expect(gumbVrati).toBeVisible();

        await gumbVrati.click();

        // Comprobamos que el formulario desaparece
        // después de devolver la entrega.
        await expect(poljeKomentara).toHaveCount(0);

        // El estudiante verifica la devolución.
        await page.goto(urlZadatka);

        await expect(
          page.getByText(KOMENTAR_DORADE, {
            exact: true,
          }),
        ).toBeVisible();

        const estados = page.getByText(
          "Vraćeno na doradu",
          { exact: true },
        );

        // El estado aparece en los detalles y el historial.
        await expect(estados).toHaveCount(2);
        await expect(estados.nth(0)).toBeVisible();
        await expect(estados.nth(1)).toBeVisible();

      } finally {
        await assistantContext.close();
      }
    },
  );

  // ====================================================
  // PRUEBA 4: SEGUNDA VERSIÓN DEL ESTUDIANTE
  // ====================================================

  test(
    "Student može predati drugu verziju zadatka",
    async ({ page }) => {
      const {
        zadatakId,
        urlZadatka,
      } = await otvoriZadatak(page);

      const forma = dohvatiFormuPredaje(page);

      await expect(forma).toBeVisible();

      // Seleccionamos la segunda versión del PDF.
      const selectorArchivos = forma.locator(
        'input[name="datoteke"]',
      );

      await expect(selectorArchivos).toHaveAttribute(
        "type",
        "file",
      );

      await selectorArchivos.setInputFiles(PDF_PATH);

      const nombreArchivo = await selectorArchivos.evaluate(
        (input: HTMLInputElement) =>
          input.files?.[0]?.name,
      );

      expect(nombreArchivo).toBe("submission.pdf");

      // Enviamos la segunda versión.
      const boton = forma.locator(
        'button[type="submit"]',
      );

      await expect(boton).toBeVisible();
      await expect(boton).toBeEnabled();

      const [respuestaApi] = await Promise.all([
        page.waitForResponse(
          (response) => {
            const url = new URL(response.url());

            return (
              response.request().method() === "POST" &&
              url.pathname === `/api/predaje/${zadatakId}`
            );
          },
          { timeout: 15_000 },
        ),

        boton.click(),
      ]);

      // Comprobamos la respuesta de la API.
      const cuerpo = await respuestaApi.text();

      expect(
        respuestaApi.ok(),
        `Error HTTP ${respuestaApi.status()}: ${cuerpo}`,
      ).toBeTruthy();

      const resultado = JSON.parse(cuerpo) as {
        predaja_id: string;
        verzija: number;
      };

      expect(resultado.predaja_id).toBeTruthy();
      expect(resultado.verzija).toBe(2);

      // Comprobamos el estado persistido.
      await page.goto(urlZadatka);

      await expect(
        page.getByText("Predano", {
          exact: true,
        }),
      ).toBeVisible();

      // Deben conservarse ambos archivos en el historial.
      await expect(
        page.getByRole("link", {
          name: "submission.pdf",
          exact: true,
        }),
      ).toHaveCount(2);
    },
  );

  // ====================================================
  // PRUEBA 5: ACEPTACIÓN Y CALIFICACIÓN DEL PROFESOR
  // ====================================================

  test(
    "Nastavnik prihvaća drugu verziju i student vidi ocjenu",
    async ({ page, browser }) => {
      const {
        urlZadatka,
        urlNastavnika,
      } = await otvoriZadatak(page);

      // Creamos una sesión independiente del profesor.
      const teacherContext = await browser.newContext({
        baseURL: BASE_URL,
        locale: "hr-HR",
      });

      try {
        const teacherPage = await teacherContext.newPage();

        // 1. Iniciamos sesión como profesor.
        await prijaviKorisnika(
          teacherPage,
          TEACHER_EMAIL,
        );

        // 2. Abrimos el listado de entregas.
        await teacherPage.goto(urlNastavnika);

        const redStudenta = teacherPage
          .locator("tr")
          .filter({ hasText: /Horvat/ });

        await expect(redStudenta).toBeVisible();

        // 3. Abrimos la entrega de Ivan.
        const enlacePredaje = redStudenta.locator(
          'a[href*="/predaje/"]',
        ).first();

        await expect(enlacePredaje).toBeVisible();

        const hrefPredaje =
          await enlacePredaje.getAttribute("href");

        if (!hrefPredaje) {
          throw new Error(
            "No se encontró el enlace a la entrega de Ivan.",
          );
        }

        await teacherPage.goto(
          new URL(hrefPredaje, BASE_URL).toString(),
        );

        // 4. Reclamamos la revisión si todavía no está asignada.
        const gumbPreuzmi = teacherPage.getByRole(
          "button",
          { name: /preuzmi/i },
        );

        if (await gumbPreuzmi.count() > 0) {
          await gumbPreuzmi.click();
        }

        // 5. Comprobamos que aparece el formulario.
        const campoComentario = teacherPage.locator(
          "#komentar-predaje",
        );

        const campoBodovi = teacherPage.locator(
          "#bodovi-predaje",
        );

        await expect(campoComentario).toBeVisible();
        await expect(campoBodovi).toBeVisible();

        // 6. Obtenemos la puntuación máxima del formulario.
        const maksimumTekst =
          await campoBodovi.getAttribute("max");

        if (maksimumTekst === null) {
          throw new Error(
            "No se encontró la puntuación máxima.",
          );
        }

        const maksimum = Number(maksimumTekst);

        expect(Number.isFinite(maksimum)).toBe(true);
        expect(maksimum).toBeGreaterThan(0);

        // 7. Introducimos comentario y puntuación.
        await campoComentario.fill(KOMENTAR_OCJENE);
        await campoBodovi.fill(String(maksimum));

        // 8. Aceptamos la entrega.
        const gumbPrihvati = teacherPage.locator(
          'button[name="odluka"][value="prihvaceno"]',
        );

        await expect(gumbPrihvati).toBeVisible();
        await expect(gumbPrihvati).toBeEnabled();

        await gumbPrihvati.click();

        // 9. Esperamos la confirmación del servidor.
        const mensajeExito = teacherPage.getByText(
          PORUKA_PRIHVACANJA,
          { exact: true },
        );

        // También aceptamos como confirmación el estado
        // actualizado de la entrega, por si la página
        // oculta el formulario tras la revalidación.
        const estadoAceptado = teacherPage.getByText(
          "Prihvaćeno",
          { exact: true },
        );

        await expect(
          mensajeExito.or(estadoAceptado).first(),
        ).toBeVisible({
          timeout: 15_000,
        });

        // 10. El estudiante consulta el resultado.
        await page.goto(urlZadatka);

        await expect(
          page.getByText("Prihvaćeno", {
            exact: true,
          }).first(),
        ).toBeVisible();

        // Comprobamos el comentario del profesor.
        await expect(
          page.getByText(KOMENTAR_OCJENE, {
            exact: true,
          }),
        ).toBeVisible();

        // Comprobamos que se han concedido todos los puntos.
        const maksimumRegex = escapeRegex(
          String(maksimum),
        );

        const rezultatRegex = new RegExp(
            `${maksimumRegex}(?:[.,]0+)?\\s*\\/\\s*${maksimumRegex}(?:[.,]0+)?`,
        );

        await expect(
          page.locator("body"),
        ).toContainText(rezultatRegex);

      } finally {
        await teacherContext.close();
      }
    },
  );
});