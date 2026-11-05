/**
 * Formatira broj prema jeziku sučelja.
 */
export function formatBroj(
  vrijednost: string | number,
  locale: string,
): string {
  return new Intl.NumberFormat(
    locale === "en" ? "en" : "hr",
    {
      maximumFractionDigits: 2,
    },
  ).format(Number(vrijednost));
}