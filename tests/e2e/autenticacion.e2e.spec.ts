
import { expect, test } from "@playwright/test";

import { prijaviStudenta } from "./pomocnici";

test("Ivan Horvat puede iniciar sesión", async ({ page }) => {
  await prijaviStudenta(
    page,
    "ivan.horvat@student.unipu.test",
  );

  await expect(
    page.locator('input[name="lozinka"]'),
  ).toHaveCount(0);
});