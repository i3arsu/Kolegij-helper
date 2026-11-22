
import { sql } from "kysely";
import type { Okruzenje } from "./pomocnici";
import { postaviScenu } from "./scena";

type Odluka = "vraceno_na_doradu" | "prihvaceno";

type RezultatPredaje = {
  predaja_id: string;
  verzija: number;
};

const DAN = 24 * 60 * 60 * 1000;

const nakonDana = (dani: number) =>
  new Date(Date.now() + dani * DAN);

export async function postaviScenuAnalitika(o: Okruzenje) {
  const s = await postaviScenu(o.vlasnik);

  let brojac = 0;

  async function noviZadatak(
    naslov: string,
    rok: Date,
    dopustiKasnu: boolean,
  ) {
    brojac++;

    const zadatak = await o.vlasnik
      .insertInto("zadatak")
      .values({
        kolegij_id: s.K1,
        naslov: `${naslov} ${brojac}`,
        opis: "",
        rok,
        max_bodova: 10,
        nacini_predaje: ["tekst"],
        dopusti_kasnu_predaju: dopustiKasnu,
        za_cijeli_kolegij: false,
        objavljen_at: nakonDana(-1),
        created_by: s.N.korisnik,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await o.vlasnik
      .insertInto("zadatak_grupa")
      .values({
        zadatak_id: zadatak.id,
        grupa_id: s.G.V1,
      })
      .execute();

    return zadatak.id;
  }

  async function predaj(
    zadatakId: string,
  ): Promise<RezultatPredaje> {
    const { rows } = await o.kao(s.S1.korisnik, (tx) =>
      sql<{ rezultat: RezultatPredaje }>`
        select private.predaj_zadatak(
          ${zadatakId}::uuid,
          ${"Sadrzaj testne predaje"}::text,
          null::text,
          ${JSON.stringify([])}::jsonb
        ) as rezultat
      `.execute(tx),
    );

    const rezultat = rows[0]?.rezultat;

    if (!rezultat) {
      throw new Error("Predaja nije kreirana.");
    }

    return rezultat;
  }

  async function ocijeni(
    predajaId: string,
    odluka: Odluka,
    bodovi: number | null,
    rokDorade: Date | null = null,
  ) {
    await o.kao(s.A.korisnik, async (tx) => {
      await sql`
        select private.preuzmi_pregled(
          ${predajaId}::uuid
        )
      `.execute(tx);

      await sql`
        select private.ocijeni(
          ${predajaId}::uuid,
          ${odluka}::text,
          ${"Komentar testne evaluacije"}::text,
          ${bodovi}::numeric,
          ${rokDorade}::timestamptz
        )
      `.execute(tx);
    });
  }

  const zadaci = {
    prihvacen: await noviZadatak(
      "Prihvacen",
      nakonDana(7),
      false,
    ),

    vracen: await noviZadatak(
      "Vracen",
      nakonDana(7),
      true,
    ),

    propustenBezKasne: await noviZadatak(
      "Propusten bez kasne predaje",
      nakonDana(-2),
      false,
    ),

    propustenSKasnom: await noviZadatak(
      "Propusten uz kasnu predaju",
      nakonDana(-2),
      true,
    ),

    rokOtvoren: await noviZadatak(
      "Rok jos traje",
      nakonDana(7),
      false,
    ),

    ponovnoOtvoren: await noviZadatak(
      "Ponovno otvoren",
      nakonDana(7),
      false,
    ),
  };

  const prihvacena = await predaj(zadaci.prihvacen);
  await ocijeni(prihvacena.predaja_id, "prihvaceno", 7);

  const vracena = await predaj(zadaci.vracen);
  await ocijeni(
    vracena.predaja_id,
    "vraceno_na_doradu",
    4,
    nakonDana(7),
  );

  const ponovnoOtvorena = await predaj(
    zadaci.ponovnoOtvoren,
  );
  await ocijeni(
    ponovnoOtvorena.predaja_id,
    "prihvaceno",
    8,
  );

  // Nastavnik ponovno otvara vec prihvacenu predaju.
  await o.kao(s.N.korisnik, (tx) =>
    sql`
      select private.ponovno_otvori(
        ${ponovnoOtvorena.predaja_id}::uuid
      )
    `.execute(tx),
  );

  return {
    ...s,
    zadaci,
    predaje: {
      prihvacena: prihvacena.predaja_id,
      vracena: vracena.predaja_id,
      ponovnoOtvorena: ponovnoOtvorena.predaja_id,
    },
  };
}