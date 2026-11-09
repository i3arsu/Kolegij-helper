
/**
 * Formatira veličinu datoteke prema jeziku sučelja.
 */
export function formatVelicina(
  velicina: number | string | bigint,
  locale: string,
): string {
  const bajtovi = Number(velicina);

  if (!Number.isFinite(bajtovi) || bajtovi < 0) {
    return String(velicina);
  }

  if (bajtovi < 1024) {
    return `${bajtovi} B`;
  }

  const jedinice = ["KB", "MB", "GB"];
  let vrijednost = bajtovi;
  let indeks = -1;

  do {
    vrijednost /= 1024;
    indeks++;
  } while (
    vrijednost >= 1024 &&
    indeks < jedinice.length - 1
  );

  const jezik = locale === "en" ? "en" : "hr";

  return `${new Intl.NumberFormat(jezik, {
    maximumFractionDigits: 1,
  }).format(vrijednost)} ${jedinice[indeks]}`;
}