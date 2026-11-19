
import { expect, test } from "@playwright/test";

import {
  dohvatiKolegijId,
  prijaviStudenta,
} from "./pomocnici";

test("Ivan de V1 puede ver Z3", async ({ page }) => {
  await prijaviStudenta(
    page,
    "ivan.horvat@student.unipu.test",
  );

  const kolegijId = await dohvatiKolegijId(page);

  await page.goto(`/moj/${kolegijId}/zadaci`);

  await expect(
    page.getByRole("link", { name: /Binarna stabla/ }),
  ).toBeVisible();
});

test("Klara de V3 no puede ver Z3", async ({ page }) => {
  await prijaviStudenta(
    page,
    "klara.saric@student.unipu.test",
  );

  const kolegijId = await dohvatiKolegijId(page);

  await page.goto(`/moj/${kolegijId}/zadaci`);

  await expect(
    page.getByRole("link", { name: /Binarna stabla/ }),
  ).toHaveCount(0);
});
