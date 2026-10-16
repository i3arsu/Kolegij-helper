
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

type OpcijeZadatka = {
  rok?: Date;
  dopustiKasnu?: boolean;
  samoV1?: boolean;
  objavljen?: boolean;
};

type Odluka = "vraceno_na_doradu" | "prihvaceno";

let o: Okruzenje;
let s: Scena;
let brojacZadataka = 0;

beforeAll(async () => {
  o = await novoOkruzenje();
  s = await postaviScenu(o.vlasnik);
});

afterAll(async () => {
  await o.zatvori();
});

async function noviZadatak(opcije: OpcijeZadatka = {}) {
  brojacZadataka++;

  const zadatak = await o.vlasnik
    .insertInto("zadatak")
    .values({
      kolegij_id: s.K1,
      naslov: `Predaja test ${brojacZadataka}`,
      opis: "",
      rok: opcije.rok ?? new Date("2030-01-01T22:59:00.000Z"),
      max_bodova: 10,
      nacini_predaje: ["datoteka", "link", "tekst"],
      dopusti_kasnu_predaju: opcije.dopustiKasnu ?? true,
      za_cijeli_kolegij: !opcije.samoV1,
      objavljen_at:
        opcije.objavljen === false
          ? null
          : new Date("2026-10-01T00:00:00.000Z"),
      created_by: s.N.korisnik,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  if (opcije.samoV1) {
    await o.vlasnik
      .insertInto("zadatak_grupa")
      .values({
        zadatak_id: zadatak.id,
        grupa_id: s.G.V1,
      })
      .execute();
  }

  return zadatak.id;
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
      throw new Error("Funkcija predaj_zadatak nije vratila rezultat.");
    }

    return vrijednost;
  });
}

async function preuzmiPregled(
  korisnikId: string,
  predajaId: string,
) {
  return o.kao(korisnikId, (tx) =>
    sql`
      select private.preuzmi_pregled(${predajaId}::uuid)
    `.execute(tx),
  );
}

async function otpustiPregled(
  korisnikId: string,
  predajaId: string,
) {
  return o.kao(korisnikId, (tx) =>
    sql`
      select private.otpusti_pregled(${predajaId}::uuid)
    `.execute(tx),
  );
}

async function ocijeni(
  korisnikId: string,
  predajaId: string,
  odluka: Odluka,
  komentar: string,
  bodovi: number | null,
  rokDorade: Date | null = null,
) {
  return o.kao(korisnikId, (tx) =>
    sql`
      select private.ocijeni(
        ${predajaId}::uuid,
        ${odluka}::text,
        ${komentar}::text,
        ${bodovi}::numeric,
        ${rokDorade}::timestamptz
      )
    `.execute(tx),
  );
}

async function ponovnoOtvori(
  korisnikId: string,
  predajaId: string,
) {
  return o.kao(korisnikId, (tx) =>
    sql`
      select private.ponovno_otvori(${predajaId}::uuid)
    `.execute(tx),
  );
}

async function stanjePredaje(predajaId: string) {
  return o.vlasnik
    .selectFrom("predaja")
    .select(["status", "trenutna_verzija", "bodovi"])
    .where("id", "=", predajaId)
    .executeTakeFirstOrThrow();
}

describe("predaja i verzije", () => {
  it("stvara prvu verziju i zamjenjuje sadržaj prije pregleda", async () => {
    const zadatakId = await noviZadatak();

    const datoteke: DatotekaUlaz[] = [
      {
        putanja: "predaje/test-prva.pdf",
        naziv: "prva.pdf",
        velicina: 1024,
        mime: "application/pdf",
        sha256: "a".repeat(64),
      },
    ];

    const prva = await predaj(
      s.S1.korisnik,
      zadatakId,
      "Prva predaja",
      datoteke,
    );

    expect(prva.verzija).toBe(1);
    expect(prva.uklonjene_putanje).toEqual([]);

    const zamjena = await predaj(
      s.S1.korisnik,
      zadatakId,
      "Ispravljena predaja",
    );

    expect(zamjena.predaja_id).toBe(prva.predaja_id);
    expect(zamjena.verzija).toBe(1);
    expect(zamjena.uklonjene_putanje).toEqual([
      "predaje/test-prva.pdf",
    ]);

    const verzije = await o.vlasnik
      .selectFrom("predaja_verzija")
      .select(["broj", "tekst"])
      .where("predaja_id", "=", prva.predaja_id)
      .execute();

    expect(verzije).toEqual([
      { broj: 1, tekst: "Ispravljena predaja" },
    ]);

    const datoteka = await o.vlasnik
      .selectFrom("datoteka")
      .select("id")
      .where("putanja", "=", "predaje/test-prva.pdf")
      .execute();

    expect(datoteka).toHaveLength(0);
    expect((await stanjePredaje(prva.predaja_id)).status).toBe(
      "predano",
    );
  });

  it("omogućuje nastavniku ili asistentu preuzimanje i otpuštanje pregleda", async () => {
    const zadatakId = await noviZadatak();
    const prva = await predaj(
      s.S1.korisnik,
      zadatakId,
      "Rad studenta S1",
    );

    await preuzmiPregled(s.A.korisnik, prva.predaja_id);

    expect(
      (await stanjePredaje(prva.predaja_id)).status,
    ).toBe("u_pregledu");

    await otpustiPregled(s.A.korisnik, prva.predaja_id);

    expect(
      (await stanjePredaje(prva.predaja_id)).status,
    ).toBe("predano");

    const predajaS2 = await predaj(
      s.S2.korisnik,
      zadatakId,
      "Rad studenta S2",
    );

    const kod = await greskaKod(
      preuzmiPregled(s.A.korisnik, predajaS2.predaja_id),
    );

    expect(kod).toBe("42501");
  });

  it("podržava vraćanje na doradu, novu verziju, prihvaćanje i ponovno otvaranje", async () => {
    const zadatakId = await noviZadatak();
    const prva = await predaj(
      s.S1.korisnik,
      zadatakId,
      "Verzija 1",
    );

    await preuzmiPregled(s.A.korisnik, prva.predaja_id);

    await ocijeni(
      s.A.korisnik,
      prva.predaja_id,
      "vraceno_na_doradu",
      "Potrebne su dodatne izmjene.",
      null,
      new Date("2030-01-01T00:00:00.000Z"),
    );

    expect(
      (await stanjePredaje(prva.predaja_id)).status,
    ).toBe("vraceno_na_doradu");

    const druga = await predaj(
      s.S1.korisnik,
      zadatakId,
      "Verzija 2",
    );

    expect(druga.predaja_id).toBe(prva.predaja_id);
    expect(druga.verzija).toBe(2);

    await preuzmiPregled(s.N.korisnik, prva.predaja_id);

    await ocijeni(
      s.N.korisnik,
      prva.predaja_id,
      "prihvaceno",
      "Rad je prihvaćen.",
      8,
    );

    const prihvacena = await stanjePredaje(prva.predaja_id);

    expect(prihvacena.status).toBe("prihvaceno");
    expect(Number(prihvacena.bodovi)).toBe(8);
    expect(prihvacena.trenutna_verzija).toBe(2);

    const izmjenaPrihvacene = await greskaKod(
      predaj(s.S1.korisnik, zadatakId, "Nedopuštena izmjena"),
    );

    expect(izmjenaPrihvacene).toBe("P0001");

    const asistentNeMozeOtvoriti = await greskaKod(
      ponovnoOtvori(s.A.korisnik, prva.predaja_id),
    );

    expect(asistentNeMozeOtvoriti).toBe("42501");

    await ponovnoOtvori(s.N.korisnik, prva.predaja_id);

    expect(
      (await stanjePredaje(prva.predaja_id)).status,
    ).toBe("u_pregledu");
  });
});

describe("prava ocjenjivanja", () => {
  it("asistent može ocijeniti S1, ali ne S2, i ne može dodijeliti previše bodova", async () => {
    const zadatakId = await noviZadatak();

    const predajaS1 = await predaj(
      s.S1.korisnik,
      zadatakId,
      "Rad S1",
    );

    const predajaS2 = await predaj(
      s.S2.korisnik,
      zadatakId,
      "Rad S2",
    );

    const zabranaS2 = await greskaKod(
      ocijeni(
        s.A.korisnik,
        predajaS2.predaja_id,
        "prihvaceno",
        "Nedopušteno",
        5,
      ),
    );

    expect(zabranaS2).toBe("42501");

    await preuzmiPregled(s.A.korisnik, predajaS1.predaja_id);

    const previseBodova = await greskaKod(
      ocijeni(
        s.A.korisnik,
        predajaS1.predaja_id,
        "prihvaceno",
        "Previše bodova",
        11,
      ),
    );

    expect(previseBodova).toBe("P0001");

    expect(
      (await stanjePredaje(predajaS1.predaja_id)).status,
    ).toBe("u_pregledu");

    await ocijeni(
      s.A.korisnik,
      predajaS1.predaja_id,
      "prihvaceno",
      "Valjana ocjena",
      10,
    );

    expect(
      (await stanjePredaje(predajaS1.predaja_id)).status,
    ).toBe("prihvaceno");

    expect(
      Number((await stanjePredaje(predajaS1.predaja_id)).bodovi),
    ).toBe(10);
  });
});

describe("rokovi predaje", () => {
  it("odbija zakašnjelu predaju ako kasna predaja nije dopuštena", async () => {
    const zadatakId = await noviZadatak({
      rok: new Date("2020-01-01T00:00:00.000Z"),
      dopustiKasnu: false,
    });

    const kod = await greskaKod(
      predaj(s.S1.korisnik, zadatakId, "Zakasnjela predaja"),
    );

    expect(kod).toBe("P0001");
  });

  it("produljenje roka omogućuje predaju nakon izvornog roka", async () => {
    const zadatakId = await noviZadatak({
      rok: new Date("2020-01-01T00:00:00.000Z"),
      dopustiKasnu: false,
    });

    await o.vlasnik
      .insertInto("produzenje_roka")
      .values({
        zadatak_id: zadatakId,
        student_id: s.S1.student,
        novi_rok: new Date("2030-01-01T00:00:00.000Z"),
        razlog: "Produljenje za test",
        odobrio: s.N.korisnik,
      })
      .execute();

    const rezultat = await predaj(
      s.S1.korisnik,
      zadatakId,
      "Predaja unutar produljenog roka",
    );

    expect(rezultat.verzija).toBe(1);
    expect((await stanjePredaje(rezultat.predaja_id)).status).toBe(
      "predano",
    );
  });

  it("primjenjuje rok dorade na drugu verziju", async () => {
    const zadatakId = await noviZadatak({
      rok: new Date("2030-01-01T00:00:00.000Z"),
      dopustiKasnu: false,
    });

    const prva = await predaj(
      s.S1.korisnik,
      zadatakId,
      "Prva verzija",
    );

    await preuzmiPregled(s.A.korisnik, prva.predaja_id);

    await ocijeni(
      s.A.korisnik,
      prva.predaja_id,
      "vraceno_na_doradu",
      "Rok dorade je istekao.",
      null,
      new Date("2020-01-01T00:00:00.000Z"),
    );

    const kod = await greskaKod(
      predaj(s.S1.korisnik, zadatakId, "Druga verzija"),
    );

    expect(kod).toBe("P0001");
  });
});

describe("zaštita RLS-a i prijelazi statusa", () => {
  it("student ne može predati zadatak koji je namijenjen samo grupi V1", async () => {
    const zadatakId = await noviZadatak({ samoV1: true });

    const kod = await greskaKod(
      predaj(s.S2.korisnik, zadatakId, "Pokušaj iz V2"),
    );

    expect(kod).toBe("42501");
  });

    it("student iz drugog kolegija ne može predati zadatak", async () => {
    const zadatakId = await noviZadatak();

    const kod = await greskaKod(
      predaj(
        s.S3.korisnik,
        zadatakId,
        "Rad studenta iz drugog kolegija",
      ),
    );

    expect(kod).toBe("42501");
  });

  it("izravno ažuriranje predaje kao student ne mijenja red", async () => {
    const zadatakId = await noviZadatak();

    const predaja = await o.vlasnik
      .insertInto("predaja")
      .values({
        zadatak_id: zadatakId,
        student_id: s.S1.student,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const promjena = await o.kao(s.S1.korisnik, (tx) =>
      tx
        .updateTable("predaja")
        .set({ status: "prihvaceno" })
        .where("id", "=", predaja.id)
        .executeTakeFirst(),
    );

    expect(promjena.numUpdatedRows).toBe(0n);

    const kod = await greskaKod(
      o.vlasnik
        .updateTable("predaja")
        .set({ status: "prihvaceno" })
        .where("id", "=", predaja.id)
        .execute(),
    );

    expect(kod).toBe("P0001");
  });

  it("odbija sve nedopuštene prijelaze statusa", async () => {
    const statusi = [
      "nije_predano",
      "predano",
      "u_pregledu",
      "vraceno_na_doradu",
      "prihvaceno",
    ] as const;

    const dopusteni = new Set([
      "nije_predano->predano",
      "predano->predano",
      "predano->u_pregledu",
      "u_pregledu->predano",
      "predano->vraceno_na_doradu",
      "u_pregledu->vraceno_na_doradu",
      "predano->prihvaceno",
      "u_pregledu->prihvaceno",
      "vraceno_na_doradu->predano",
      "prihvaceno->u_pregledu",
    ]);

    for (const od of statusi) {
      for (const prema of statusi) {
        if (dopusteni.has(`${od}->${prema}`)) continue;

        const zadatakId = await noviZadatak();

        const predaja = await o.vlasnik
          .insertInto("predaja")
          .values({
            zadatak_id: zadatakId,
            student_id: s.S1.student,
            status: od,
            trenutna_verzija: od === "nije_predano" ? 0 : 1,
          })
          .returning("id")
          .executeTakeFirstOrThrow();

        const kod = await greskaKod(
          o.vlasnik
            .updateTable("predaja")
            .set({ status: prema })
            .where("id", "=", predaja.id)
            .execute(),
        );

        expect(
          kod,
          `Prijelaz ${od} -> ${prema} mora biti odbijen`,
        ).toBe("P0001");
      }
    }
  });

  it("student vidi samo svoje predaje i verzije", async () => {
    const zadatakId = await noviZadatak();

    const predajaS1 = await predaj(
      s.S1.korisnik,
      zadatakId,
      "Privatni rad S1",
    );

    const predajaS2 = await predaj(
      s.S2.korisnik,
      zadatakId,
      "Privatni rad S2",
    );

    const predajeS1 = await o.kao(s.S1.korisnik, (tx) =>
      tx.selectFrom("predaja").select("id").execute(),
    );

    expect(
      predajeS1.some((p) => p.id === predajaS1.predaja_id),
    ).toBe(true);

    expect(
      predajeS1.some((p) => p.id === predajaS2.predaja_id),
    ).toBe(false);

    const verzijeS2 = await o.kao(s.S1.korisnik, (tx) =>
      tx
        .selectFrom("predaja_verzija")
        .select("id")
        .where("predaja_id", "=", predajaS2.predaja_id)
        .execute(),
    );

    expect(verzijeS2).toEqual([]);
  });


  it("student vidi samo vlastite datoteke, povratne informacije i produljenja", async () => {
    const zadatakId = await noviZadatak();

    const putanjaS1 = "predaje/izolacija-s1.pdf";
    const putanjaS2 = "predaje/izolacija-s2.pdf";

    const predajaS1 = await predaj(
      s.S1.korisnik,
      zadatakId,
      "Rad studenta S1",
      [{
        putanja: putanjaS1,
        naziv: "izolacija-s1.pdf",
        velicina: 1024,
        mime: "application/pdf",
        sha256: "1".repeat(64),
      }],
    );

    const predajaS2 = await predaj(
      s.S2.korisnik,
      zadatakId,
      "Rad studenta S2",
      [{
        putanja: putanjaS2,
        naziv: "izolacija-s2.pdf",
        velicina: 1024,
        mime: "application/pdf",
        sha256: "2".repeat(64),
      }],
    );

    for (const [predaja, komentar, bodovi] of [
      [predajaS1, "Povratna informacija S1", 8],
      [predajaS2, "Povratna informacija S2", 7],
    ] as const) {
      await preuzmiPregled(s.N.korisnik, predaja.predaja_id);

      await ocijeni(
        s.N.korisnik,
        predaja.predaja_id,
        "prihvaceno",
        komentar,
        bodovi,
      );
    }

    await o.vlasnik
      .insertInto("produzenje_roka")
      .values([
        {
          zadatak_id: zadatakId,
          student_id: s.S1.student,
          novi_rok: new Date("2030-01-01T00:00:00.000Z"),
          razlog: "Produljenje za S1",
          odobrio: s.N.korisnik,
        },
        {
          zadatak_id: zadatakId,
          student_id: s.S2.student,
          novi_rok: new Date("2030-01-02T00:00:00.000Z"),
          razlog: "Produljenje za S2",
          odobrio: s.N.korisnik,
        },
      ])
      .execute();

    const r = await o.kao(s.S1.korisnik, async (tx) => ({
            prilogS1: await sql<{ n: string }>`
        select count(*) as n
        from public.predaja_datoteka pd
        join public.predaja_verzija pv
          on pv.id = pd.verzija_id
        where pv.predaja_id = ${predajaS1.predaja_id}::uuid
      `.execute(tx),

      prilogS2: await sql<{ n: string }>`
        select count(*) as n
        from public.predaja_datoteka pd
        join public.predaja_verzija pv
          on pv.id = pd.verzija_id
        where pv.predaja_id = ${predajaS2.predaja_id}::uuid
      `.execute(tx),

      datotekaS1: await sql<{ n: string }>`
        select count(*) as n from public.datoteka
        where putanja = ${putanjaS1}
      `.execute(tx),

      datotekaS2: await sql<{ n: string }>`
        select count(*) as n from public.datoteka
        where putanja = ${putanjaS2}
      `.execute(tx),

      povratnaS1: await sql<{ n: string }>`
        select count(*) as n from public.povratna_informacija
        where predaja_id = ${predajaS1.predaja_id}::uuid
      `.execute(tx),

      povratnaS2: await sql<{ n: string }>`
        select count(*) as n from public.povratna_informacija
        where predaja_id = ${predajaS2.predaja_id}::uuid
      `.execute(tx),

      rokS1: await sql<{ n: string }>`
        select count(*) as n from public.produzenje_roka
        where zadatak_id = ${zadatakId}::uuid
          and student_id = ${s.S1.student}::uuid
      `.execute(tx),

      rokS2: await sql<{ n: string }>`
        select count(*) as n from public.produzenje_roka
        where zadatak_id = ${zadatakId}::uuid
          and student_id = ${s.S2.student}::uuid
      `.execute(tx),
    }));

    const broj = (rezultat: { rows: { n: string }[] }) =>
      Number(rezultat.rows[0]?.n ?? 0);

    expect({
      prilogS1: broj(r.prilogS1),
      prilogS2: broj(r.prilogS2),
      datotekaS1: broj(r.datotekaS1),
      datotekaS2: broj(r.datotekaS2),
      povratnaS1: broj(r.povratnaS1),
      povratnaS2: broj(r.povratnaS2),
      rokS1: broj(r.rokS1),
      rokS2: broj(r.rokS2),
    }).toEqual({
      prilogS1: 1,
      prilogS2: 0,
      datotekaS1: 1,
      datotekaS2: 0,
      povratnaS1: 1,
      povratnaS2: 0,
      rokS1: 1,
      rokS2: 0,
    });
  });


  it("nove tablice ne vraćaju podatke bez korisničkog konteksta", async () => {
    const tablice = [
      "predaja",
      "predaja_verzija",
      "predaja_datoteka",
      "povratna_informacija",
      "datoteka",
      "produzenje_roka",
      "v_predaja",
      "v_predaja_verzija",
    ] as const;

    const rezultat = await o.bezKonteksta(async (tx) =>
      Object.fromEntries(
        await Promise.all(
          tablice.map(async (tablica) => {
            const r = await sql<{ broj: string }>`
              select count(*) as broj
              from ${sql.table(tablica)}
            `.execute(tx);

            return [tablica, Number(r.rows[0]?.broj ?? 0)];
          }),
        ),
      ),
    );

    expect(
      Object.values(rezultat).every((broj) => broj === 0),
    ).toBe(true);
  });
});

describe("v_predaja i v_predaja_verzija", () => {
  it("prikazuje zakašnjelu predaju i računa novi rok bez ponovnog spremanja", async () => {
    const zadatakId = await noviZadatak({
      rok: new Date("2020-01-01T00:00:00.000Z"),
      dopustiKasnu: true,
    });

    const predaja = await predaj(
      s.S1.korisnik,
      zadatakId,
      "Zakašnjeli rad",
    );

    const prije = await o.kao(s.S1.korisnik, (tx) =>
      sql<{ kasni: boolean }>`
        select kasni
        from public.v_predaja_verzija
        where predaja_id = ${predaja.predaja_id}::uuid
          and broj = 1
      `.execute(tx),
    );

    expect(prije.rows[0]?.kasni).toBe(true);

    await o.vlasnik
      .updateTable("zadatak")
      .set({ rok: new Date("2035-01-01T00:00:00.000Z") })
      .where("id", "=", zadatakId)
      .execute();

    const poslije = await o.kao(s.S1.korisnik, (tx) =>
      sql<{ kasni: boolean; rok_prosao: boolean }>`
        select zv.kasni, vp.rok_prosao
        from public.v_predaja vp
        join public.v_predaja_verzija zv
          on zv.predaja_id = vp.predaja_id
         and zv.broj = vp.trenutna_verzija
        where vp.zadatak_id = ${zadatakId}::uuid
      `.execute(tx),
    );

    expect(poslije.rows[0]?.kasni).toBe(false);
    expect(poslije.rows[0]?.rok_prosao).toBe(false);
  });

  it("primjenjuje pojedinačno produljenje na oznaku zakašnjenja", async () => {
    const zadatakId = await noviZadatak({
      rok: new Date("2020-01-01T00:00:00.000Z"),
      dopustiKasnu: true,
    });

    const predaja = await predaj(
      s.S1.korisnik,
      zadatakId,
      "Rad s produljenjem",
    );

    await o.vlasnik
      .insertInto("produzenje_roka")
      .values({
        zadatak_id: zadatakId,
        student_id: s.S1.student,
        novi_rok: new Date("2030-01-01T00:00:00.000Z"),
        razlog: "Produljenje roka za test",
        odobrio: s.N.korisnik,
      })
      .execute();

    const red = await o.kao(s.S1.korisnik, (tx) =>
      sql<{ kasni: boolean; rok: Date; rok_prosao: boolean }>`
        select kasni, rok, rok_prosao
        from public.v_predaja
        where predaja_id = ${predaja.predaja_id}::uuid
      `.execute(tx),
    );

    expect(red.rows[0]?.kasni).toBe(false);
    expect(red.rows[0]?.rok_prosao).toBe(false);
    expect(new Date(red.rows[0]!.rok).getTime()).toBe(
      new Date("2030-01-01T00:00:00.000Z").getTime(),
    );
  });

  it("računa zakašnjenje druge verzije prema roku dorade", async () => {
    const zadatakId = await noviZadatak({
      rok: new Date("2030-01-01T00:00:00.000Z"),
      dopustiKasnu: true,
    });

    const prva = await predaj(
      s.S1.korisnik,
      zadatakId,
      "Verzija 1",
    );

    await preuzmiPregled(s.A.korisnik, prva.predaja_id);

    await ocijeni(
      s.A.korisnik,
      prva.predaja_id,
      "vraceno_na_doradu",
      "Dorada je potrebna.",
      null,
      new Date("2020-01-01T00:00:00.000Z"),
    );

    const druga = await predaj(
      s.S1.korisnik,
      zadatakId,
      "Verzija 2",
    );

    expect(druga.verzija).toBe(2);

    const red = await o.kao(s.S1.korisnik, (tx) =>
      sql<{ kasni: boolean; rok_verzije: Date | null }>`
        select kasni, rok_verzije
        from public.v_predaja_verzija
        where predaja_id = ${prva.predaja_id}::uuid
          and broj = 2
      `.execute(tx),
    );

    expect(red.rows[0]?.kasni).toBe(true);
    expect(new Date(red.rows[0]!.rok_verzije!).getTime()).toBe(
      new Date("2020-01-01T00:00:00.000Z").getTime(),
    );
  });

  it("student vidi samo svoje redove u objema pogledima", async () => {
    const zadatakId = await noviZadatak();

    const predajaS1 = await predaj(
      s.S1.korisnik,
      zadatakId,
      "Privatna predaja S1",
    );

    const predajaS2 = await predaj(
      s.S2.korisnik,
      zadatakId,
      "Privatna predaja S2",
    );

    const pregledS1 = await o.kao(s.S1.korisnik, async (tx) => ({
      predaje: await sql<{ student_id: string }>`
        select student_id
        from public.v_predaja
        where zadatak_id = ${zadatakId}::uuid
      `.execute(tx),

      verzije: await sql<{ predaja_id: string }>`
        select predaja_id
        from public.v_predaja_verzija
        where predaja_id = ${predajaS2.predaja_id}::uuid
      `.execute(tx),
    }));

    expect(
      pregledS1.predaje.rows.map((r) => r.student_id),
    ).toEqual([s.S1.student]);

    expect(pregledS1.verzije.rows).toEqual([]);

    expect(predajaS1.predaja_id).not.toBe(predajaS2.predaja_id);
  });
});