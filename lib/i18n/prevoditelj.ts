import { createTranslator } from "next-intl";
import hr from "@/messages/hr.json";

/**
 * Funkcija prijevoda kakvu vraćaju getTranslations/useTranslations za jedan namespace.
 * Parametri su namjerno široki (any) da se tipizirani next-intl Translator može predati čistim funkcijama u lib/.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Prevoditelj = (kljuc: any, vrijednosti?: any) => string;

/** Hrvatski prevoditelj izvan Reacta (zadano za čiste funkcije u lib/ i za testove). */
export function hrvatski(namespace: string): Prevoditelj {
  const t = createTranslator({ locale: "hr", messages: hr });
  return (kljuc, vrijednosti) => (t as unknown as Prevoditelj)(`${namespace}.${kljuc}`, vrijednosti);
}
