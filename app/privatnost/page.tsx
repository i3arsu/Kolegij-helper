import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privatnost" };

// Predložak — tekst mora odobriti službenik za zaštitu podataka sveučilišta.
export default function Privatnost() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8 text-sm leading-6">
      <h1 className="text-2xl font-semibold">Obavijest o obradi osobnih podataka</h1>
      <p>
        Aplikacija obrađuje podatke potrebne za praćenje nastave: ime, prezime, JMBAG, e-mail adresu, pripadnost grupama,
        dolaznost, predane radove, bodove i povratne informacije.
      </p>
      <p>
        Podaci se pohranjuju isključivo na poslužitelju sveučilišta. Student vidi samo vlastite podatke; nastavnik i
        asistent vide podatke studenata na svojim kolegijima, odnosno grupama.
      </p>
      <p>Voditelj obrade, rok čuvanja i kontakt službenika za zaštitu podataka: <em>[popuniti]</em>.</p>
    </main>
  );
}
