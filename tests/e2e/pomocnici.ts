import { expect, type Page } from "@playwright/test";

export async function prijaviKorisnika(
  page: Page,
  email: string,
): Promise<void> {
  const lozinka = process.env.SEED_LOZINKA;

  if (!lozinka) {
    throw new Error("SEED_LOZINKA nije konfiguriran.");
  }

  await page.goto("/prijava");

  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="lozinka"]').fill(lozinka);

  await page.locator('button[type="submit"]').click();

  await expect(page).not.toHaveURL(/\/prijava(?:\?.*)?$/);
}

export async function prijaviStudenta(
  page: Page,
  email: string,
): Promise<void> {
  await prijaviKorisnika(page, email);
  await expect(page).toHaveURL(/\/moj$/);
}

export async function dohvatiKolegijId(
  page: Page,
): Promise<string> {
  await page.goto("/moj");

  const poveznica = page.getByRole("link", {
    name: /Programiranje 2/,
  });

  await expect(poveznica).toBeVisible();

  const href = await poveznica.getAttribute("href");
  const rezultat = href?.match(
    /\/moj\/([0-9a-f-]{36})(?:\/|$)/i,
  );

  expect(rezultat).not.toBeNull();

  return rezultat![1];
}