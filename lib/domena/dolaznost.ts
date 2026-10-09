// Ista formula kao view v_dolaznost (db/migrations/0007_view_dolaznost.sql); test provjerava podudarnost.

export type NacinOpravdanog = "kao_prisutan" | "izuzeto" | "kao_odsutan";

export function postotakDolaznosti(
  z: { odrzano: number; prisutan: number; opravdano: number },
  nacin: NacinOpravdanog,
): number | null {
  const [brojnik, nazivnik] =
    nacin === "kao_prisutan"
      ? [z.prisutan + z.opravdano, z.odrzano]
      : nacin === "kao_odsutan"
        ? [z.prisutan, z.odrzano]
        : [z.prisutan, z.odrzano - z.opravdano];
  if (nazivnik <= 0) return null;
  return Math.round((1000 * brojnik) / nazivnik) / 10;
}

export function zadovoljava(postotak: number | null, prag: number): boolean | null {
  return postotak === null ? null : postotak >= prag;
}

export const NAZIV_STATUSA: Record<string, string> = {
  prisutan: "Prisutan",
  odsutan: "Odsutan",
  opravdano: "Opravdano",
};

export const NAZIV_TIPA: Record<string, string> = {
  predavanje: "Predavanja",
  vjezbe: "Vježbe",
};
