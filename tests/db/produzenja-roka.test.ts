
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  greskaKod,
  novoOkruzenje,
  type Okruzenje,
} from "./pomocnici";

import {
  postaviScenu,
  type Scena,
} from "./scena";

import {
  postaviScenuZadaci,
  type ScenaZadaci,
} from "./scena-zadaci";

import {
  produzenjaRokaZadatka,
  spremiProduzenjeRoka,
  ukloniProduzenjeRoka,
  type PodaciProduzenjaRoka,
} from "@/lib/servisi/produzenja-roka";

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

// Cada test parte de la tabla de ampliaciones vacía
// para la tarea de referencia.
afterEach(async () => {
  await o.vlasnik
    .deleteFrom("produzenje_roka")
    .where("zadatak_id", "=", z.Z.cijeliKolegij)
    .execute();
});

function podaciProduzenja(
  studentId: string,
  noviRok: Date,
  razlog: string | null,
  odobrio = s.N.korisnik,
): PodaciProduzenjaRoka {
  return {
    zadatak_id: z.Z.cijeliKolegij,
    student_id: studentId,
    novi_rok: noviRok,
    razlog,
    odobrio,
  };
}

describe("servis pojedinačnih produljenja roka", () => {
  it("nastavnik može kreirati, izmijeniti i ukloniti produljenje", async () => {
    const prviRok = new Date(
      "2030-01-05T22:59:00.000Z",
    );

    const prviRazlog = "Opravdana odsutnost";

    await o.kao(s.N.korisnik, (tx) =>
      spremiProduzenjeRoka(
        tx,
        podaciProduzenja(
          s.S1.student,
          prviRok,
          prviRazlog,
        ),
      ),
    );

    const stvoreno = await o.kao(
      s.N.korisnik,
      (tx) =>
        produzenjaRokaZadatka(
          tx,
          z.Z.cijeliKolegij,
        ),
    );

    expect(stvoreno).toHaveLength(1);
    expect(stvoreno[0]).toMatchObject({
      student_id: s.S1.student,
      novi_rok: prviRok,
      razlog: prviRazlog,
      odobrio: s.N.korisnik,
    });

    const drugiRok = new Date(
      "2030-01-10T22:59:00.000Z",
    );

    const drugiRazlog = "Odobrena dodatna vremena";

    // Ponovni upis treba ažurirati postojeći red,
    // a ne stvarati novu ampliación.
    await o.kao(s.N.korisnik, (tx) =>
      spremiProduzenjeRoka(
        tx,
        podaciProduzenja(
          s.S1.student,
          drugiRok,
          drugiRazlog,
        ),
      ),
    );

    const izmijenjeno = await o.kao(
      s.N.korisnik,
      (tx) =>
        produzenjaRokaZadatka(
          tx,
          z.Z.cijeliKolegij,
        ),
    );

    expect(izmijenjeno).toHaveLength(1);
    expect(izmijenjeno[0]).toMatchObject({
      student_id: s.S1.student,
      novi_rok: drugiRok,
      razlog: drugiRazlog,
      odobrio: s.N.korisnik,
    });

    await o.kao(s.N.korisnik, (tx) =>
      ukloniProduzenjeRoka(
        tx,
        z.Z.cijeliKolegij,
        s.S1.student,
      ),
    );

    const nakonUklanjanja = await o.kao(
      s.N.korisnik,
      (tx) =>
        produzenjaRokaZadatka(
          tx,
          z.Z.cijeliKolegij,
        ),
    );

    expect(nakonUklanjanja).toEqual([]);
  });

  it("asistent ne može kreirati ni izmijeniti produljenje", async () => {
    const rok = new Date(
      "2030-01-07T22:59:00.000Z",
    );

    // El asistente no puede crear una ampliación nueva.
    const kodKreiranja = await greskaKod(
      o.kao(s.A.korisnik, (tx) =>
        spremiProduzenjeRoka(
          tx,
          podaciProduzenja(
            s.S2.student,
            rok,
            "Pokušaj asistenta",
            s.A.korisnik,
          ),
        ),
      ),
    );

    expect(kodKreiranja).toBe("42501");

    // Preparamos una ampliación legítima del profesor.
    await o.kao(s.N.korisnik, (tx) =>
      spremiProduzenjeRoka(
        tx,
        podaciProduzenja(
          s.S1.student,
          rok,
          "Odobrio nastavnik",
        ),
      ),
    );

    // El asistente tampoco puede modificarla mediante upsert.
    const kodIzmjene = await greskaKod(
      o.kao(s.A.korisnik, (tx) =>
        spremiProduzenjeRoka(
          tx,
          podaciProduzenja(
            s.S1.student,
            new Date("2030-01-12T22:59:00.000Z"),
            "Nedopuštena izmjena",
            s.A.korisnik,
          ),
        ),
      ),
    );

    expect(kodIzmjene).toBe("42501");
  });

  it("nastavnik drugog kolegija ne može dodati produljenje", async () => {
    const kod = await greskaKod(
      o.kao(s.N2.korisnik, (tx) =>
        spremiProduzenjeRoka(
          tx,
          podaciProduzenja(
            s.S1.student,
            new Date("2030-01-15T22:59:00.000Z"),
            "Drugi kolegij",
            s.N2.korisnik,
          ),
        ),
      ),
    );

    expect(kod).toBe("42501");
  });

  it("student vidi samo svoje produljenje, a nastavnik vidi sva produljenja kolegija", async () => {
    await o.kao(s.N.korisnik, async (tx) => {
      await spremiProduzenjeRoka(
        tx,
        podaciProduzenja(
          s.S1.student,
          new Date("2030-01-05T22:59:00.000Z"),
          "Produljenje S1",
        ),
      );

      await spremiProduzenjeRoka(
        tx,
        podaciProduzenja(
          s.S2.student,
          new Date("2030-01-08T22:59:00.000Z"),
          "Produljenje S2",
        ),
      );
    });

    const produljenjeS1 = await o.kao(
      s.S1.korisnik,
      (tx) =>
        produzenjaRokaZadatka(
          tx,
          z.Z.cijeliKolegij,
        ),
    );

    expect(produljenjeS1).toHaveLength(1);
    expect(produljenjeS1[0].student_id).toBe(
      s.S1.student,
    );

    const produljenjeS2 = await o.kao(
      s.S2.korisnik,
      (tx) =>
        produzenjaRokaZadatka(
          tx,
          z.Z.cijeliKolegij,
        ),
    );

    expect(produljenjeS2).toHaveLength(1);
    expect(produljenjeS2[0].student_id).toBe(
      s.S2.student,
    );

    const svaProduljenja = await o.kao(
      s.N.korisnik,
      (tx) =>
        produzenjaRokaZadatka(
          tx,
          z.Z.cijeliKolegij,
        ),
    );

    expect(svaProduljenja).toHaveLength(2);

    expect(
      new Set(
        svaProduljenja.map((red) => red.student_id),
      ),
    ).toEqual(
      new Set([s.S1.student, s.S2.student]),
    );
  });
});