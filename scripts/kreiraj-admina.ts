/**
 * Kreira prvog administratora (i po želji člana osoblja). Lozinka se generira i ispisuje jednom.
 *
 *   npm run kreiraj-admina -- email@unipu.hr [Ime Prezime]
 */
import "dotenv/config";
import { napraviBazu } from "../lib/db/klijent";
import { generirajLozinku } from "../lib/auth/generator-lozinke";
import { hashLozinke } from "../lib/auth/lozinka";

async function main() {
  const [email, ime, prezime] = process.argv.slice(2);
  if (!email?.includes("@")) {
    console.error("Upotreba: npm run kreiraj-admina -- email@unipu.hr [Ime Prezime]");
    process.exit(1);
  }
  const db = napraviBazu(process.env.OWNER_DATABASE_URL!, 1);
  const lozinka = generirajLozinku();
  const korisnik = await db
    .insertInto("korisnik")
    .values({ email: email.toLowerCase(), lozinka_hash: await hashLozinke(lozinka), je_admin: true, mora_promijeniti_lozinku: true })
    .returning("id")
    .executeTakeFirstOrThrow();
  if (ime && prezime) {
    await db.insertInto("osoblje").values({ korisnik_id: korisnik.id, ime, prezime }).execute();
  }
  console.log(`Admin ${email} kreiran. Privremena lozinka (prikazuje se samo sada): ${lozinka}`);
  await db.destroy();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
