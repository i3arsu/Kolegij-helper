import type { Baza } from "@/lib/db/klijent";
import type { Scena } from "./scena";

type OpcijeZadatka = {
  naslov: string;
  zaCijeliKolegij: boolean;
  objavljenAt: Date | null;
};

async function dodajZadatak(
  db: Baza,
  scena: Scena,
  opcije: OpcijeZadatka,
) {
  return (
    await db
      .insertInto("zadatak")
      .values({
        kolegij_id: scena.K1,
        naslov: opcije.naslov,
        opis: "",
        rok: new Date("2030-01-01T22:59:00.000Z"),
        max_bodova: 10,
        nacini_predaje: ["datoteka"],
        dopusti_kasnu_predaju: true,
        za_cijeli_kolegij: opcije.zaCijeliKolegij,
        objavljen_at: opcije.objavljenAt,
        created_by: scena.N.korisnik,
      })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

export async function postaviScenuZadaci(
  db: Baza,
  scena: Scena,
) {
  const objavljenoAt = new Date("2026-09-01T08:00:00.000Z");

  const cijeliKolegij = await dodajZadatak(db, scena, {
    naslov: "Zadatak cijeli kolegij",
    zaCijeliKolegij: true,
    objavljenAt: objavljenoAt,
  });

  const samoV1 = await dodajZadatak(db, scena, {
    naslov: "Zadatak samo V1",
    zaCijeliKolegij: false,
    objavljenAt: objavljenoAt,
  });

  await db
    .insertInto("zadatak_grupa")
    .values({
      zadatak_id: samoV1,
      grupa_id: scena.G.V1,
    })
    .execute();

  const skica = await dodajZadatak(db, scena, {
    naslov: "Skica zadatka",
    zaCijeliKolegij: true,
    objavljenAt: null,
  });

  return {
    Z: {
      cijeliKolegij,
      samoV1,
      skica,
    },
  };
}

export type ScenaZadaci = Awaited<
  ReturnType<typeof postaviScenuZadaci>
>;