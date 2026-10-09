// Pretvara greške baze u poruke za korisnika. Poruke iz naših funkcija (P0001) su već na hrvatskom.
export function porukaGreske(e: unknown): string {
  const g = e as { code?: string; message?: string; constraint?: string };
  switch (g?.code) {
    case "P0001":
      return g.message ?? "Greška.";
    case "42501":
      return "Nemate ovlasti za ovu radnju.";
    case "23505":
      return "Zapis s tim podacima već postoji.";
    case "23P01":
      return g.constraint === "clanstvo_bez_preklapanja"
        ? "Student ne može istovremeno biti u dvije grupe istog tipa."
        : "Preklapanje s postojećim zapisom.";
    case "23514":
      return "Neispravni podaci.";
  }
  if (g?.message && !g.code) return g.message;
  console.error(e);
  return "Došlo je do greške. Pokušajte ponovno.";
}
