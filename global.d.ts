import type messages from "./messages/hr.json";

// Tipizirani ključevi prijevoda: TypeScript javlja nepostojeći ključ u t("...").
// hr.json je izvor; tests/unit/i18n.test.ts provjerava da en.json ima iste ključeve.
declare module "next-intl" {
  interface AppConfig {
    Messages: typeof messages;
  }
}
