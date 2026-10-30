import { sql } from "kysely";
import type { Tx } from "@/lib/db/klijent";
import { GreskaAplikacije } from "@/lib/http/greske";

export async function mojiKolegiji(tx: Tx) {
  // RLS vraća samo kolegije na kojima je korisnik osoblje ili upisani student (admin vidi sve).
  return tx
    .selectFrom("kolegij")
    .select(["id", "naziv", "sifra", "akademska_godina", "semestar", "arhiviran"])
    .orderBy("akademska_godina", "desc")
    .orderBy("naziv")
    .execute();
}

export async function kolegij(tx: Tx, kolegijId: string) {
  return tx
    .selectFrom("kolegij")
    .select(["id", "naziv", "sifra", "akademska_godina", "semestar", "arhiviran"])
    .where("id", "=", kolegijId)
    .executeTakeFirst();
}

export async function kreirajKolegij(
  tx: Tx,
  podaci: { naziv: string; sifra: string; akademska_godina: string; semestar: "zimski" | "ljetni" },
  nastavnikOsobljeId: string | null,
) {
  const k = await tx.insertInto("kolegij").values(podaci).returning("id").executeTakeFirstOrThrow();
  if (nastavnikOsobljeId) {
    await tx.insertInto("osoblje_kolegija").values({ kolegij_id: k.id, osoblje_id: nastavnikOsobljeId, uloga: "nastavnik" }).execute();
  }
  return k.id;
}

export async function osobljeKolegija(tx: Tx, kolegijId: string) {
  return tx
    .selectFrom("osoblje_kolegija as ok")
    .innerJoin("osoblje as o", "o.id", "ok.osoblje_id")
    .select(["o.id", "o.ime", "o.prezime", "o.titula", "ok.uloga"])
    .where("ok.kolegij_id", "=", kolegijId)
    .orderBy("ok.uloga", "desc")
    .orderBy("o.prezime")
    .execute();
}

export async function dodajOsoblje(tx: Tx, kolegijId: string, email: string, uloga: "nastavnik" | "asistent") {
  const { rows } = await sql<{ id: string | null }>`select private.nadji_osoblje(${email}) as id`.execute(tx);
  const osobljeId = rows[0]?.id;
  if (!osobljeId) throw new GreskaAplikacije("staffEmailNotFound");
  await tx
    .insertInto("osoblje_kolegija")
    .values({ kolegij_id: kolegijId, osoblje_id: osobljeId, uloga })
    .onConflict((oc) => oc.columns(["kolegij_id", "osoblje_id"]).doUpdateSet({ uloga }))
    .execute();
}

export async function ukloniOsoblje(tx: Tx, kolegijId: string, osobljeId: string, mojOsobljeId: string) {
  if (osobljeId === mojOsobljeId) throw new GreskaAplikacije("cannotRemoveSelf");
  await tx.deleteFrom("asistent_grupa").where("osoblje_id", "=", osobljeId)
    .where("grupa_id", "in", (eb) => eb.selectFrom("grupa").select("id").where("kolegij_id", "=", kolegijId))
    .execute();
  await tx.deleteFrom("osoblje_kolegija").where("kolegij_id", "=", kolegijId).where("osoblje_id", "=", osobljeId).execute();
}

export async function grupeSAsistentima(tx: Tx, kolegijId: string) {
  const { rows } = await sql<{
    id: string; naziv: string; tip: "predavanje" | "vjezbe"; broj_studenata: number;
    asistenti: { id: string; ime: string; prezime: string }[];
  }>`
    select g.id, g.naziv, g.tip::text as tip,
           (select count(*)::int from clanstvo_grupe cg join upis u on u.id = cg.upis_id
             where cg.grupa_id = g.id and upper_inf(cg.vrijedi) and u.status = 'aktivan') as broj_studenata,
           coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'ime', o.ime, 'prezime', o.prezime) order by o.prezime)
                     from asistent_grupa ag join osoblje o on o.id = ag.osoblje_id where ag.grupa_id = g.id), '[]') as asistenti
    from grupa g
    where g.kolegij_id = ${kolegijId}
    order by g.tip, g.naziv
  `.execute(tx);
  return rows;
}

export async function kreirajGrupu(tx: Tx, kolegijId: string, naziv: string, tip: "predavanje" | "vjezbe") {
  await tx.insertInto("grupa").values({ kolegij_id: kolegijId, naziv, tip }).execute();
}

export async function postaviAsistenta(tx: Tx, grupaId: string, osobljeId: string, dodijeljen: boolean) {
  if (dodijeljen) {
    await tx.insertInto("asistent_grupa").values({ grupa_id: grupaId, osoblje_id: osobljeId })
      .onConflict((oc) => oc.doNothing()).execute();
  } else {
    await tx.deleteFrom("asistent_grupa").where("grupa_id", "=", grupaId).where("osoblje_id", "=", osobljeId).execute();
  }
}

export async function pravilaProlaza(tx: Tx, kolegijId: string) {
  return tx.selectFrom("pravila_prolaza").selectAll().where("kolegij_id", "=", kolegijId).executeTakeFirst();
}

export async function spremiPravila(
  tx: Tx,
  kolegijId: string,
  p: { min_dolaznost_predavanja: number; min_dolaznost_vjezbi: number; min_bodova: number; opravdano_se_racuna: string },
) {
  const r = await tx.updateTable("pravila_prolaza").set(p).where("kolegij_id", "=", kolegijId).executeTakeFirst();
  if (Number(r.numUpdatedRows) === 0) throw new GreskaAplikacije("rulesForbidden");
}

export async function predlosciKomentara(tx: Tx, kolegijId: string) {
  return tx
    .selectFrom("predlozak_komentara")
    .select(["id", "kolegij_id", "naslov", "tekst"])
    .where("kolegij_id", "=", kolegijId)
    .orderBy("naslov")
    .execute();
}

export async function kreirajPredlozakKomentara(
  tx: Tx,
  kolegijId: string,
  p: { naslov: string; tekst: string },
) {
  return tx
    .insertInto("predlozak_komentara")
    .values({
      kolegij_id: kolegijId,
      naslov: p.naslov.trim(),
      tekst: p.tekst.trim(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
}

export async function urediPredlozakKomentara(
  tx: Tx,
  kolegijId: string,
  predlozakId: string,
  p: { naslov: string; tekst: string },
) {
  const rezultat = await tx
    .updateTable("predlozak_komentara")
    .set({
      naslov: p.naslov.trim(),
      tekst: p.tekst.trim(),
    })
    .where("id", "=", predlozakId)
    .where("kolegij_id", "=", kolegijId)
    .executeTakeFirst();

  if (Number(rezultat.numUpdatedRows) === 0) {
    throw new GreskaAplikacije("commentTemplateNotFound");
  }
}

export async function ukloniPredlozakKomentara(
  tx: Tx,
  kolegijId: string,
  predlozakId: string,
) {
  const rezultat = await tx
    .deleteFrom("predlozak_komentara")
    .where("id", "=", predlozakId)
    .where("kolegij_id", "=", kolegijId)
    .executeTakeFirst();

  if (Number(rezultat.numDeletedRows) === 0) {
    throw new GreskaAplikacije("commentTemplateNotFound");
  }
}
