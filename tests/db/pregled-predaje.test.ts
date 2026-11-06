
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  novoOkruzenje,
  sql,
  type Okruzenje,
} from "./pomocnici";

import {
  postaviScenu,
  type Scena,
} from "./scena";

import {
  pregledPredaje,
  sljedecaPredajaZaPregled,
} from "@/lib/servisi/pregled-predaje";

type DatotekaUlaz = {
  putanja: string;
  naziv: string;
  velicina: number;
  mime: string;
  sha256: string;
};

type RezultatPredaje = {
  predaja_id: string;
  verzija: number;
  uklonjene_putanje: string[];
};

type Odluka = "vraceno_na_doradu" | "prihvaceno";

let o: Okruzenje;
let s: Scena;

beforeEach(async () => {
  o = await novoOkruzenje();
  s = await postaviScenu(o.vlasnik);
});

afterEach(async () => {
  await o.zatvori();
});

async function noviZadatak() {
  return (
    await o.vlasnik
      .insertInto("zadatak")
      .values({
        kolegij_id: s.K1,
        naslov: "Zadatak za pregled",
        opis: "Opis zadatka za testiranje pregleda.",
        rok: new Date("2030-01-01T22:59:00.000Z"),
        max_bodova: 10,
        nacini_predaje: ["datoteka", "tekst"],
        dopusti_kasnu_predaju: true,
        za_cijeli_kolegij: true,
        objavljen_at: new Date("2026-10-01T00:00:00.000Z"),
        created_by: s.N.korisnik,
      })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

async function predaj(
  korisnikId: string,
  zadatakId: string,
  tekst: string,
  datoteke: DatotekaUlaz[] = [],
): Promise<RezultatPredaje> {
  return o.kao(korisnikId, async (tx) => {
    const rezultat = await sql<{
      rezultat: RezultatPredaje;
    }>`
      select private.predaj_zadatak(
        ${zadatakId}::uuid,
        ${tekst}::text,
        null::text,
        ${JSON.stringify(datoteke)}::jsonb
      ) as rezultat
    `.execute(tx);

    const vrijednost = rezultat.rows[0]?.rezultat;

    if (!vrijednost) {
      throw new Error(
        "Funkcija predaj_zadatak nije vratila rezultat.",
      );
    }

    return vrijednost;
  });
}

async function ocijeni(
  korisnikId: string,
  predajaId: string,
  odluka: Odluka,
  komentar: string,
  bodovi: number | null,
  rokDorade: Date | null = null,
) {
  await o.kao(korisnikId, async (tx) => {
    await sql`
      select private.preuzmi_pregled(
        ${predajaId}::uuid
      )
    `.execute(tx);

    await sql`
      select private.ocijeni(
        ${predajaId}::uuid,
        ${odluka}::text,
        ${komentar}::text,
        ${bodovi}::numeric,
        ${rokDorade}::timestamptz
      )
    `.execute(tx);
  });
}

describe("pregledPredaje", () => {
  it(
    "dohvaća podatke studenta, sve verzije, povratne informacije i datoteke",
    async () => {
      const zadatakId = await noviZadatak();

      const prvaDatoteka: DatotekaUlaz[] = [
        {
          putanja: "predaje/pregled-prva.pdf",
          naziv: "prva.pdf",
          velicina: 1024,
          mime: "application/pdf",
          sha256: "a".repeat(64),
        },
      ];

      const drugaDatoteka: DatotekaUlaz[] = [
        {
          putanja: "predaje/pregled-druga.pdf",
          naziv: "druga.pdf",
          velicina: 2048,
          mime: "application/pdf",
          sha256: "b".repeat(64),
        },
      ];

      // Student predaje prvu verziju.
      const prva = await predaj(
        s.S1.korisnik,
        zadatakId,
        "Sadržaj prve verzije.",
        prvaDatoteka,
      );

      expect(prva.verzija).toBe(1);

      // Nastavnik vraća prvu verziju na doradu.
      const rokDorade = new Date(
        "2029-01-01T22:59:00.000Z",
      );

      await ocijeni(
        s.N.korisnik,
        prva.predaja_id,
        "vraceno_na_doradu",
        "Potrebne su dodatne izmjene.",
        null,
        rokDorade,
      );

      // Student predaje drugu verziju.
      const druga = await predaj(
        s.S1.korisnik,
        zadatakId,
        "Sadržaj druge verzije.",
        drugaDatoteka,
      );

      expect(druga.predaja_id).toBe(prva.predaja_id);
      expect(druga.verzija).toBe(2);

      // Nastavnik prihvaća drugu verziju.
      await ocijeni(
        s.N.korisnik,
        prva.predaja_id,
        "prihvaceno",
        "Rad je uspješno završen.",
        9,
      );

      // Dohvaćamo pregled kao nastavnik.
      const detalji = await o.kao(
        s.N.korisnik,
        (tx) =>
          pregledPredaje(
            tx,
            s.K1,
            zadatakId,
            prva.predaja_id,
          ),
      );

      expect(detalji).not.toBeNull();

      if (!detalji) {
        throw new Error("Predaja nije pronađena.");
      }

      // Osnovni podaci o predaji i studentu.
      expect(detalji.predaja_id).toBe(prva.predaja_id);
      expect(detalji.student_id).toBe(s.S1.student);
      expect(detalji.jmbag).toBe("0000000001");
      expect(detalji.ime).toBe("Stu");
      expect(detalji.prezime).toBe("s1@student.unipu.test");

      // Podaci o zadatku.
      expect(detalji.zadatak_id).toBe(zadatakId);
      expect(detalji.naslov).toBe("Zadatak za pregled");
      expect(detalji.opis).toBe(
        "Opis zadatka za testiranje pregleda.",
      );
      expect(Number(detalji.max_bodova)).toBe(10);
      expect(detalji.nacini_predaje).toEqual([
        "datoteka",
        "tekst",
      ]);

      // Trenutno stanje predaje.
      expect(detalji.status).toBe("prihvaceno");
      expect(detalji.trenutna_verzija).toBe(2);
      expect(Number(detalji.bodovi)).toBe(9);
      expect(detalji.pregledava).toBeNull();

      // Najnovija verzija mora biti prva.
      expect(detalji.verzije).toHaveLength(2);
      expect(
        detalji.verzije.map((verzija) => verzija.broj),
      ).toEqual([2, 1]);

      const verzija2 = detalji.verzije[0]!;
      const verzija1 = detalji.verzije[1]!;

      // Druga verzija: prihvaćena.
      expect(verzija2.tekst).toBe(
        "Sadržaj druge verzije.",
      );
      expect(verzija2.odluka).toBe("prihvaceno");
      expect(verzija2.komentar).toBe(
        "Rad je uspješno završen.",
      );
      expect(Number(verzija2.bodovi)).toBe(9);
      expect(verzija2.rok_dorade).toBeNull();
      expect(verzija2.autor_id).toBe(s.N.korisnik);
      expect(verzija2.datoteke).toHaveLength(1);
      expect(verzija2.datoteke[0]?.naziv).toBe("druga.pdf");
      expect(verzija2.datoteke[0]?.velicina).toBe("2048");

      // Prva verzija: vraćena na doradu.
      expect(verzija1.tekst).toBe(
        "Sadržaj prve verzije.",
      );
      expect(verzija1.odluka).toBe("vraceno_na_doradu");
      expect(verzija1.komentar).toBe(
        "Potrebne su dodatne izmjene.",
      );
      expect(verzija1.rok_dorade?.getTime()).toBe(
        rokDorade.getTime(),
      );
      expect(verzija1.autor_id).toBe(s.N.korisnik);
      expect(verzija1.datoteke).toHaveLength(1);
      expect(verzija1.datoteke[0]?.naziv).toBe("prva.pdf");
      expect(verzija1.datoteke[0]?.velicina).toBe("1024");
    },
  );

  it(
    "poštuje vidljivost grupa za nastavnika i asistenta",
    async () => {
      const zadatakId = await noviZadatak();

      // Oba studenta predaju isti zadatak.
      const predajaS1 = await predaj(
        s.S1.korisnik,
        zadatakId,
        "Rad studenta S1",
      );

      const predajaS2 = await predaj(
        s.S2.korisnik,
        zadatakId,
        "Rad studenta S2",
      );

      // Asistent je dodijeljen grupi V1 i može vidjeti S1.
      const pregledS1 = await o.kao(
        s.A.korisnik,
        (tx) =>
          pregledPredaje(
            tx,
            s.K1,
            zadatakId,
            predajaS1.predaja_id,
          ),
      );

      expect(pregledS1).not.toBeNull();
      expect(pregledS1?.student_id).toBe(s.S1.student);

      // S2 pripada grupi V2, kojoj asistent nema pristup.
      const pregledS2Asistenta = await o.kao(
        s.A.korisnik,
        (tx) =>
          pregledPredaje(
            tx,
            s.K1,
            zadatakId,
            predajaS2.predaja_id,
          ),
      );

      expect(pregledS2Asistenta).toBeNull();

      // Nastavnik ima pristup objema grupama.
      const pregledS2Nastavnika = await o.kao(
        s.N.korisnik,
        (tx) =>
          pregledPredaje(
            tx,
            s.K1,
            zadatakId,
            predajaS2.predaja_id,
          ),
      );

      expect(pregledS2Nastavnika).not.toBeNull();
      expect(pregledS2Nastavnika?.student_id).toBe(
        s.S2.student,
      );
    },
  );

  it(
    "vraća null za nepostojeću predaju ili pogrešan kolegij",
    async () => {
      const zadatakId = await noviZadatak();

      const predaja = await predaj(
        s.S1.korisnik,
        zadatakId,
        "Rad studenta S1",
      );

      const nepostojeca = await o.kao(
        s.N.korisnik,
        (tx) =>
          pregledPredaje(
            tx,
            s.K1,
            zadatakId,
            "00000000-0000-4000-8000-000000000000",
          ),
      );

      expect(nepostojeca).toBeNull();

      // Predaja postoji, ali ne pripada kolegiju K2.
      const pogresanKolegij = await o.kao(
        s.N.korisnik,
        (tx) =>
          pregledPredaje(
            tx,
            s.K2,
            zadatakId,
            predaja.predaja_id,
          ),
      );

      expect(pogresanKolegij).toBeNull();
    },
  );

  it(
    "vraća sljedeću predaju na čekanju i poštuje RLS vidljivost",
    async () => {
      const zadatakId = await noviZadatak();

      // Dva studenta predaju isti zadatak.
      const predajaS1 = await predaj(
        s.S1.korisnik,
        zadatakId,
        "Rad studenta S1",
      );

      const predajaS2 = await predaj(
        s.S2.korisnik,
        zadatakId,
        "Rad studenta S2",
      );

      // Nastavnik vidi obje predaje.
      const sljedecaNastavniku = await o.kao(
        s.N.korisnik,
        (tx) =>
          sljedecaPredajaZaPregled(
            tx,
            s.K1,
            zadatakId,
            predajaS1.predaja_id,
          ),
      );

      expect(sljedecaNastavniku).toBe(
        predajaS2.predaja_id,
      );

      // Asistent vidi S1, ali ne i S2 (grupa V2).
      // Budući da je S1 trenutna predaja, nema sljedeće.
      const sljedecaAsistentu = await o.kao(
        s.A.korisnik,
        (tx) =>
          sljedecaPredajaZaPregled(
            tx,
            s.K1,
            zadatakId,
            predajaS1.predaja_id,
          ),
      );

      expect(sljedecaAsistentu).toBeNull();

      // Nastavnik prihvaća S1 kako više ne bi bila na čekanju.
      await ocijeni(
        s.N.korisnik,
        predajaS1.predaja_id,
        "prihvaceno",
        "Rad je uspješno završen.",
        10,
      );

      // Ako nema drugih predaja na čekanju, rezultat je null.
      const nemaSljedece = await o.kao(
        s.N.korisnik,
        (tx) =>
          sljedecaPredajaZaPregled(
            tx,
            s.K1,
            zadatakId,
            predajaS2.predaja_id,
          ),
      );

      expect(nemaSljedece).toBeNull();
    },
  );
});