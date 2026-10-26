import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  greskaKod,
  novoOkruzenje,
  sql,
  type Okruzenje,
} from "./pomocnici";

import { postaviScenu, type Scena } from "./scena";
import {
  postaviScenuZadaci,
  type ScenaZadaci,
} from "./scena-zadaci";

let o: Okruzenje;
let s: Scena;
let z: ScenaZadaci;

beforeAll(async () => {
  o = await novoOkruzenje();
  s = await postaviScenu(o.vlasnik);
  z = await postaviScenuZadaci(o.vlasnik, s);
});

afterAll(async () => {
  await o.zatvori();
});

function vrijednostiZadatka(
  scena: Scena,
  naslov: string,
  objavljenAt: Date | null,
) {
  return {
    kolegij_id: scena.K1,
    naslov,
    opis: "",
    rok: new Date("2030-01-01T22:59:00.000Z"),
    max_bodova: 10,
    nacini_predaje: ["datoteka"],
    dopusti_kasnu_predaju: true,
    za_cijeli_kolegij: true,
    objavljen_at: objavljenAt,
    created_by: scena.N.korisnik,
  };
}

describe("dodjela zadataka", () => {
  it("student S1 vidi objavljeni zadatak kolegija i zadatak svoje grupe", async () => {
    const redovi = await o.kao(s.S1.korisnik, (tx) =>
      tx.selectFrom("zadatak").select("id").execute(),
    );

    expect(new Set(redovi.map((r) => r.id))).toEqual(
      new Set([z.Z.cijeliKolegij, z.Z.samoV1]),
    );
  });

  it("student S2 iz V2 ne vidi zadatak namijenjen samo grupi V1", async () => {
    const redovi = await o.kao(s.S2.korisnik, (tx) =>
      tx.selectFrom("zadatak").select("id").execute(),
    );

    expect(redovi.map((r) => r.id)).toEqual([
      z.Z.cijeliKolegij,
    ]);

    expect(
      redovi.some((r) => r.id === z.Z.samoV1),
    ).toBe(false);
  });

  it("studenti ne vide skice ni povezivanje zadataka s grupama", async () => {
    const r = await o.kao(s.S1.korisnik, async (tx) => ({
      zadaci: await tx
        .selectFrom("zadatak")
        .select("id")
        .execute(),

      grupe: await tx
        .selectFrom("zadatak_grupa")
        .selectAll()
        .execute(),
    }));

    expect(r.zadaci.some((x) => x.id === z.Z.skica)).toBe(false);
    expect(r.grupe).toEqual([]);
  });

  it("nastavnik i asistent mogu vidjeti zadatke kolegija", async () => {
    const nastavnik = await o.kao(s.N.korisnik, (tx) =>
      tx.selectFrom("zadatak").select("id").execute(),
    );

    const asistent = await o.kao(s.A.korisnik, (tx) =>
      tx.selectFrom("zadatak").select("id").execute(),
    );

    const ocekivani = new Set([
      z.Z.cijeliKolegij,
      z.Z.samoV1,
      z.Z.skica,
    ]);

    expect(new Set(nastavnik.map((x) => x.id))).toEqual(
      ocekivani,
    );

    expect(new Set(asistent.map((x) => x.id))).toEqual(
      ocekivani,
    );
  });
});

describe("prava nastavnika i asistenta", () => {
  it("nastavnik može kreirati zadatak", async () => {
    const novi = await o.kao(s.N.korisnik, (tx) =>
      tx
        .insertInto("zadatak")
        .values(
          vrijednostiZadatka(
            s,
            "Novi zadatak nastavnika",
            null,
          ),
        )
        .returning("id")
        .executeTakeFirstOrThrow(),
    );

    expect(novi.id).toBeTruthy();
  });

  it("asistent ne može kreirati ni uređivati zadatke", async () => {
    const kod = await greskaKod(
      o.kao(s.A.korisnik, (tx) =>
        tx
          .insertInto("zadatak")
          .values({
            ...vrijednostiZadatka(
              s,
              "Nedopušteni zadatak",
              null,
            ),
            created_by: s.A.korisnik,
          })
          .execute(),
      ),
    );

    expect(kod).toBe("42501");

    const izmjena = await o.kao(s.A.korisnik, (tx) =>
      tx
        .updateTable("zadatak")
        .set({ naslov: "Nedopuštena izmjena" })
        .where("id", "=", z.Z.cijeliKolegij)
        .executeTakeFirst(),
    );

    expect(izmjena.numUpdatedRows).toBe(0n);
  });

  it("nastavnik ne može zadatak povezati s grupom drugog kolegija", async () => {
    const kod = await greskaKod(
      o.kao(s.N.korisnik, (tx) =>
        tx
          .insertInto("zadatak_grupa")
          .values({
            zadatak_id: z.Z.cijeliKolegij,
            grupa_id: s.GK2,
          })
          .execute(),
      ),
    );

    expect(kod).toBe("42501");
  });
});

describe("vlasnistvo datoteka zadatka", () => {
  it("nastavnik ne može kao prilog dodati datoteku studentske predaje", async () => {
    const datotekaId = await dodajTestnuDatoteku(
      s.S1.korisnik,
      "studentska-predaja.pdf",
    );

    await dodajPredajuSDatotekom(datotekaId);

    const kod = await greskaKod(
      o.kao(s.N.korisnik, (tx) =>
        tx
          .insertInto("zadatak_prilog")
          .values({
            zadatak_id: z.Z.cijeliKolegij,
            datoteka_id: datotekaId,
          })
          .execute(),
      ),
    );

    expect(kod).toBe("42501");
  });

  it("nastavnik može kao prilog dodati vlastitu datoteku", async () => {
    const datotekaId = await dodajTestnuDatoteku(
      s.N.korisnik,
      "nastavnikov-prilog.pdf",
    );

    const prilog = await o.kao(s.N.korisnik, (tx) =>
      tx
        .insertInto("zadatak_prilog")
        .values({
          zadatak_id: z.Z.cijeliKolegij,
          datoteka_id: datotekaId,
        })
        .returning("datoteka_id")
        .executeTakeFirstOrThrow(),
    );

    expect(prilog.datoteka_id).toBe(datotekaId);
  });

  it("nastavnik može umetnuti vlastitu datoteku i vratiti ID", async () => {
    const naziv = "nastavnikov-insert-returning.pdf";

    const rezultat = await o.kao(s.N.korisnik, (tx) =>
      tx
      .insertInto("datoteka")
      .values({
          putanja: `test/${s.N.korisnik}/${naziv}`,
          naziv,
          velicina: 128,
          mime: "application/pdf",
          sha256: "c".repeat(64),
          vlasnik: s.N.korisnik,
        })
      .returning("id")
      .executeTakeFirstOrThrow(),
    );

    expect(rezultat.id).toBeTruthy();
  });
});

describe("uklanjanje priloga zadatka", () => {
  it("nastavnik uklanja nekorišten prilog i njegove metapodatke", async () => {
    const naziv = "uklanjanje-nekoristenog-priloga.pdf";

    const datotekaId = await dodajTestnuDatoteku(
      s.N.korisnik,
      naziv,
    );

    await o.kao(s.N.korisnik, (tx) =>
      tx
        .insertInto("zadatak_prilog")
        .values({
          zadatak_id: z.Z.cijeliKolegij,
          datoteka_id: datotekaId,
        })
        .execute(),
    );

    const rezultat = await ukloniPrilogZadatka(
      s.N.korisnik,
      z.Z.cijeliKolegij,
      datotekaId,
    );

    expect(rezultat).toEqual({
      pronadjen: true,
      putanja: `test/${s.N.korisnik}/${naziv}`,
    });

    const datoteka = await o.vlasnik
      .selectFrom("datoteka")
      .select("id")
      .where("id", "=", datotekaId)
      .executeTakeFirst();

    const prilog = await o.vlasnik
      .selectFrom("zadatak_prilog")
      .selectAll()
      .where("datoteka_id", "=", datotekaId)
      .executeTakeFirst();

    expect(datoteka).toBeUndefined();
    expect(prilog).toBeUndefined();
  });

  it("čuva datoteku koja se još koristi u studentskoj predaji", async () => {
    const naziv = "prilog-koji-koristi-predaja.pdf";

    const datotekaId = await dodajTestnuDatoteku(
      s.N.korisnik,
      naziv,
    );

    const zadatak = await o.vlasnik
      .insertInto("zadatak")
      .values(
        vrijednostiZadatka(
          s,
          "Zadatak za provjeru referenci priloga",
          new Date("2030-01-01T22:59:00.000Z"),
        ),
      )
      .returning("id")
      .executeTakeFirstOrThrow();

    await o.kao(s.N.korisnik, (tx) =>
      tx
        .insertInto("zadatak_prilog")
        .values({
          zadatak_id: zadatak.id,
          datoteka_id: datotekaId,
        })
        .execute(),
    );

    const predaja = await o.vlasnik
      .insertInto("predaja")
      .values({
        zadatak_id: zadatak.id,
        student_id: s.S1.student,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const verzija = await o.vlasnik
      .insertInto("predaja_verzija")
      .values({
        predaja_id: predaja.id,
        broj: 1,
        tekst: null,
        link: null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await o.vlasnik
      .insertInto("predaja_datoteka")
      .values({
        verzija_id: verzija.id,
        datoteka_id: datotekaId,
      })
      .execute();

    const rezultat = await ukloniPrilogZadatka(
      s.N.korisnik,
      zadatak.id,
      datotekaId,
    );

    expect(rezultat).toEqual({
      pronadjen: true,
      putanja: null,
    });

    const datoteka = await o.vlasnik
      .selectFrom("datoteka")
      .select("id")
      .where("id", "=", datotekaId)
      .executeTakeFirst();

    const povezanaPredaja = await o.vlasnik
      .selectFrom("predaja_datoteka")
      .select("datoteka_id")
      .where("datoteka_id", "=", datotekaId)
      .executeTakeFirst();

    const prilog = await o.vlasnik
      .selectFrom("zadatak_prilog")
      .selectAll()
      .where("datoteka_id", "=", datotekaId)
      .executeTakeFirst();

    expect(datoteka?.id).toBe(datotekaId);
    expect(povezanaPredaja?.datoteka_id).toBe(datotekaId);
    expect(prilog).toBeUndefined();
  });

  it("odbija asistenta i ostavlja prilog netaknutim", async () => {
    const datotekaId = await dodajTestnuDatoteku(
      s.N.korisnik,
      "prilog-zasticen-od-asistenta.pdf",
    );

    await o.kao(s.N.korisnik, (tx) =>
      tx
        .insertInto("zadatak_prilog")
        .values({
          zadatak_id: z.Z.cijeliKolegij,
          datoteka_id: datotekaId,
        })
        .execute(),
    );

    const kod = await greskaKod(
      ukloniPrilogZadatka(
        s.A.korisnik,
        z.Z.cijeliKolegij,
        datotekaId,
      ),
    );

    expect(kod).toBe("42501");

    const prilog = await o.vlasnik
      .selectFrom("zadatak_prilog")
      .select("datoteka_id")
      .where("zadatak_id", "=", z.Z.cijeliKolegij)
      .where("datoteka_id", "=", datotekaId)
      .executeTakeFirst();

    expect(prilog?.datoteka_id).toBe(datotekaId);
  });

  it("ne uklanja datoteku koja nije prilog zadanog zadatka", async () => {
    const naziv = "datoteka-koja-nije-prilog.pdf";

    const datotekaId = await dodajTestnuDatoteku(
      s.N.korisnik,
      naziv,
    );

    const rezultat = await ukloniPrilogZadatka(
      s.N.korisnik,
      z.Z.cijeliKolegij,
      datotekaId,
    );

    expect(rezultat).toEqual({
      pronadjen: false,
      putanja: null,
    });

    const datoteka = await o.vlasnik
      .selectFrom("datoteka")
      .select("id")
      .where("id", "=", datotekaId)
      .executeTakeFirst();

    expect(datoteka?.id).toBe(datotekaId);
  });


  it("ne otkriva postojanje veze korisniku bez ovlasti", async () => {
    const datotekaId = await dodajTestnuDatoteku(
      s.N.korisnik,
      "prilog-nevidljiv-neovlastenom.pdf",
    );

    // Datoteka postoji, ali nije povezana sa zadatkom.
    const kod = await greskaKod(
      ukloniPrilogZadatka(
        s.A.korisnik,
        z.Z.cijeliKolegij,
        datotekaId,
      ),
    );

    expect(kod).toBe("42501");

    const datoteka = await o.vlasnik
      .selectFrom("datoteka")
      .select("id")
      .where("id", "=", datotekaId)
      .executeTakeFirst();

    expect(datoteka?.id).toBe(datotekaId);
  });


  it("nastavnik može ukloniti prilog drugog nastavnika bez brisanja njegove datoteke", async () => {
    const naziv = "prilog-drugog-nastavnika.pdf";

    const datotekaId = await dodajTestnuDatoteku(s.N.korisnik, naziv);

    await o.kao(s.N.korisnik, (tx) =>
      tx
        .insertInto("zadatak_prilog")
        .values({
          zadatak_id: z.Z.cijeliKolegij,
          datoteka_id: datotekaId,
        })
        .execute(),
    );

    const drugiKorisnik = await o.vlasnik
      .insertInto("korisnik")
      .values({
        email: "drugi-nastavnik-prilog@unipu.test",
        lozinka_hash: "x",
        mora_promijeniti_lozinku: false,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const drugiNastavnik = await o.vlasnik
      .insertInto("osoblje")
      .values({
        korisnik_id: drugiKorisnik.id,
        ime: "Drugi",
        prezime: "Nastavnik",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await o.vlasnik
      .insertInto("osoblje_kolegija")
      .values({
        kolegij_id: s.K1,
        osoblje_id: drugiNastavnik.id,
        uloga: "nastavnik",
      })
      .execute();

    const rezultat = await ukloniPrilogZadatka(
      drugiKorisnik.id,
      z.Z.cijeliKolegij,
      datotekaId,
    );

    expect(rezultat).toEqual({
      pronadjen: true,
      putanja: null,
    });

    const datoteka = await o.vlasnik
      .selectFrom("datoteka")
      .select("id")
      .where("id", "=", datotekaId)
      .executeTakeFirst();

    expect(datoteka?.id).toBe(datotekaId);

    const prilog = await o.vlasnik
      .selectFrom("zadatak_prilog")
      .selectAll()
      .where("zadatak_id", "=", z.Z.cijeliKolegij)
      .where("datoteka_id", "=", datotekaId)
      .executeTakeFirst();

    expect(prilog).toBeUndefined();
  });

});

describe("brisanje zadataka", () => {
  it("nastavnik može obrisati skicu, ali ne i objavljeni zadatak", async () => {
    // Napravimo zasebnu skicu kako test ne bi ovisio o drugim testovima.
    const skica = await o.vlasnik
      .insertInto("zadatak")
      .values(
        vrijednostiZadatka(
          s,
          "Skica za test brisanja",
          null,
        ),
      )
      .returning("id")
      .executeTakeFirstOrThrow();

    const brisanjeSkice = await o.kao(s.N.korisnik, (tx) =>
      tx
        .deleteFrom("zadatak")
        .where("id", "=", skica.id)
        .executeTakeFirst(),
    );

    expect(brisanjeSkice.numDeletedRows).toBe(1n);

    const brisanjeObjavljenog = await o.kao(
      s.N.korisnik,
      (tx) =>
        tx
          .deleteFrom("zadatak")
          .where("id", "=", z.Z.cijeliKolegij)
          .executeTakeFirst(),
    );

    expect(brisanjeObjavljenog.numDeletedRows).toBe(0n);

    const iDaljePostoji = await o.kao(
      s.N.korisnik,
      (tx) =>
        tx
          .selectFrom("zadatak")
          .select("id")
          .where("id", "=", z.Z.cijeliKolegij)
          .execute(),
    );

    expect(iDaljePostoji).toHaveLength(1);
  });
});

describe("RLS bez korisničkog konteksta", () => {
  it("nove tablice ne vraćaju redove bez konteksta", async () => {
    const tablice = [
      "zadatak",
      "zadatak_grupa",
      "datoteka",
      "zadatak_prilog",
      "produzenje_roka",
      "predlozak_komentara",
    ] as const;

    const rezultat = await o.bezKonteksta(async (tx) =>
      Object.fromEntries(
        await Promise.all(
          tablice.map(async (tablica) => {
            const r = await sql<{ broj: string }>`
              select count(*) as broj
              from ${sql.table(tablica)}
            `.execute(tx);

            return [tablica, Number(r.rows[0].broj)];
          }),
        ),
      ),
    );

    expect(
      Object.values(rezultat).every((broj) => broj === 0),
    ).toBe(true);
  });
});

async function dodajTestnuDatoteku(
  vlasnik: string,
  naziv: string,
) {
  return (
    await o.vlasnik
      .insertInto("datoteka")
      .values({
        putanja: `test/${vlasnik}/${naziv}`,
        naziv,
        velicina: 128,
        mime: "application/pdf",
        sha256: "a".repeat(64),
        vlasnik,
      })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

async function dodajPredajuSDatotekom(
  datotekaId: string,
) {
  const predaja = await o.vlasnik
    .insertInto("predaja")
    .values({
      zadatak_id: z.Z.cijeliKolegij,
      student_id: s.S1.student,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  const verzija = await o.vlasnik
    .insertInto("predaja_verzija")
    .values({
      predaja_id: predaja.id,
      broj: 1,
      tekst: null,
      link: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  await o.vlasnik
    .insertInto("predaja_datoteka")
    .values({
      verzija_id: verzija.id,
      datoteka_id: datotekaId,
    })
    .execute();
}

async function ukloniPrilogZadatka(
  korisnikId: string,
  zadatakId: string,
  datotekaId: string,
) {
  return o.kao(korisnikId, async (tx) => {
    const odgovor = await sql<{
      rezultat: {
        pronadjen: boolean;
        putanja: string | null;
      };
    }>`
      select private.ukloni_prilog_zadatka(
        ${zadatakId}::uuid,
        ${datotekaId}::uuid
      ) as rezultat
    `.execute(tx);

    const rezultat = odgovor.rows[0]?.rezultat;

    if (!rezultat) {
      throw new Error(
        "Funkcija ukloni_prilog_zadatka nije vratila rezultat.",
      );
    }

    return rezultat;
  });
}