
import "server-only";
import { sql } from "kysely";
import { bazaAuth } from "@/lib/db";
import {
  hashLozinke,
  laznaProvjera,
  provjeriLozinku,
  provjeriNovuLozinku,
} from "./lozinka";

import {type RazlogNoveLozinke,} from "./lozinka";

const PROZOR = sql<Date>`now() - interval '15 minutes'`;

export const MAX_POKUSAJA_PO_EMAILU = 5;
export const MAX_POKUSAJA_PO_IP = 30;
export const PORUKA_NEISPRAVNO = "Neispravan e-mail ili lozinka.";
export const PORUKA_ZAKLJUCANO =
  "Previše neuspjelih pokušaja. Pokušajte ponovno za 15 minuta.";

type RazlogNeuspjeha = "neispravno" | "zakljucano";

type Rezultat =
  | { ok: true; korisnikId: string }
  | { ok: false; razlog: RazlogNeuspjeha };

type RazlogPromjeneLozinke =
  | "trenutnaNeispravna"
  | "istaKaoTrenutna"
  | RazlogNoveLozinke;

async function neuspjeliPokusaji(email: string, ip: string | null) {
  const baza = bazaAuth();

  // Brojimo neuspjehe od zadnje uspješne prijave unutar 15 minuta.
  // Vrijedi i za nepoznate e-mailove kako poruka o zaključavanju
  // ne bi otkrivala postoji li račun.
  const poEmailu = await baza
    .selectFrom("prijava_pokusaj")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("email", "=", email)
    .where("uspjeh", "=", false)
    .where("created_at", ">", PROZOR)
    .where("created_at", ">", (eb) =>
      eb
        .selectFrom("prijava_pokusaj as u")
        .select(
          sql<Date>`coalesce(max(u.created_at), '-infinity')`.as("zadnji"),
        )
        .where("u.email", "=", email)
        .where("u.uspjeh", "=", true),
    )
    .executeTakeFirstOrThrow();

  const poIp = ip
    ? await baza
        .selectFrom("prijava_pokusaj")
        .select((eb) => eb.fn.countAll<string>().as("n"))
        .where("ip", "=", ip)
        .where("uspjeh", "=", false)
        .where("created_at", ">", PROZOR)
        .executeTakeFirstOrThrow()
    : { n: "0" };

  return {
    poEmailu: Number(poEmailu.n),
    poIp: Number(poIp.n),
  };
}

async function zabiljezi(
  email: string,
  ip: string | null,
  uspjeh: boolean,
) {
  await bazaAuth()
    .insertInto("prijava_pokusaj")
    .values({ email, ip, uspjeh })
    .execute();
}

export async function prijavi(
  emailUnos: string,
  lozinka: string,
  ip: string | null,
): Promise<Rezultat> {
  const email = emailUnos.trim().toLowerCase();

  if (!email || !lozinka) {
    return { ok: false, razlog: "neispravno" };
  }

  const pokusaji = await neuspjeliPokusaji(email, ip);

  if (
    pokusaji.poEmailu >= MAX_POKUSAJA_PO_EMAILU ||
    pokusaji.poIp >= MAX_POKUSAJA_PO_IP
  ) {
    await zabiljezi(email, ip, false);

    return { ok: false, razlog: "zakljucano" };
  }

  const korisnik = await bazaAuth()
    .selectFrom("korisnik")
    .select(["id", "lozinka_hash", "aktivan"])
    .where("email", "=", email)
    .executeTakeFirst();

  if (!korisnik) {
    await laznaProvjera(lozinka);
    await zabiljezi(email, ip, false);

    return { ok: false, razlog: "neispravno" };
  }

  const ispravna = await provjeriLozinku(
    korisnik.lozinka_hash,
    lozinka,
  );

  if (!ispravna || !korisnik.aktivan) {
    await zabiljezi(email, ip, false);

    return { ok: false, razlog: "neispravno" };
  }

  await zabiljezi(email, ip, true);

  await bazaAuth()
    .updateTable("korisnik")
    .set({ zadnja_prijava: new Date() })
    .where("id", "=", korisnik.id)
    .execute();

  return {
    ok: true,
    korisnikId: korisnik.id,
  };
}

/**
 * Promjena vlastite lozinke:
 * provjerava staru lozinku, sprema novu i uklanja zastavicu
 * obavezne promjene lozinke.
 */


export async function promijeniLozinku(
  korisnikId: string,
  stara: string,
  nova: string,
  jmbag: string | null,
): Promise<
  { ok: true } | { ok: false; razlog: RazlogPromjeneLozinke }
> {
  const korisnik = await bazaAuth()
    .selectFrom("korisnik")
    .select(["lozinka_hash", "email"])
    .where("id", "=", korisnikId)
    .executeTakeFirstOrThrow();

  if (!(await provjeriLozinku(korisnik.lozinka_hash, stara))) {
    return { ok: false, razlog: "trenutnaNeispravna" };
  }

  if (stara === nova) {
    return { ok: false, razlog: "istaKaoTrenutna" };
  }

  const greska = provjeriNovuLozinku(nova, {
    email: korisnik.email,
    jmbag,
  });

  if (greska) {
    return { ok: false, razlog: greska };
  }

  await bazaAuth()
    .updateTable("korisnik")
    .set({
      lozinka_hash: await hashLozinke(nova),
      mora_promijeniti_lozinku: false,
      lozinka_promijenjena_at: new Date(),
    })
    .where("id", "=", korisnikId)
    .execute();

  return { ok: true };
}