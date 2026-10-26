
import type { NextRequest } from "next/server";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  dohvatiProfil,
  ulogaNaKolegiju,
  upit,
  type Profil,
} from "@/lib/auth/guard";
import { POST } from "@/app/api/zadaci/[zadatakId]/prilozi/route";

// Creamos los mocks antes de cargar los módulos que los utilizan.
const {
  spremiMock,
  obrisiMock,
} = vi.hoisted(() => ({
  spremiMock: vi.fn(),
  obrisiMock: vi.fn(),
}));

// Simulamos las funciones de autenticación y consulta.
vi.mock("@/lib/auth/guard", () => ({
  dohvatiProfil: vi.fn(),
  ulogaNaKolegiju: vi.fn(),
  upit: vi.fn(),
}));

// Simulamos el almacenamiento.
vi.mock("@/lib/datoteke/spremiste", () => ({
  obrisi: obrisiMock,
  spremi: spremiMock,
}));

const ZADATAK_ID =
  "11111111-1111-4111-8111-111111111111";

const KOLEGIJ_ID =
  "33333333-3333-4333-8333-333333333333";

const DATOTEKA_ID =
  "66666666-6666-4666-8666-666666666666";

function profilNastavnika(
  izmjene: Partial<Profil> = {},
): Profil {
  return {
    korisnikId: "22222222-2222-4222-8222-222222222222",
    email: "nastavnik@example.test",
    jeAdmin: false,
    moraPromijenitiLozinku: false,
    osoblje: {
      id: "44444444-4444-4444-8444-444444444444",
      ime: "Pero",
      prezime: "Perić",
      titula: null,
    },
    student: null,
    ...izmjene,
  };
}

function napraviZahtjev(
  opcije: {
    origin?: string | null;
    contentLength?: string | null;
    contentType?: string | null;
    forma?: FormData;
  } = {},
) {
  const url = new URL(
    `https://example.test/api/zadaci/${ZADATAK_ID}/prilozi`,
  );

  const {
    origin = url.origin,
    contentLength = "100",
    contentType = "multipart/form-data; boundary=test",
    forma = new FormData(),
  } = opcije;

  const headers = new Headers();

  if (origin !== null) {
    headers.set("origin", origin);
  }

  if (contentLength !== null) {
    headers.set("content-length", contentLength);
  }

  if (contentType !== null) {
    headers.set("content-type", contentType);
  }

  let tijeloProcitano = false;

  const request = {
    headers,
    nextUrl: url,
    formData: async () => {
      tijeloProcitano = true;
      return forma;
    },
  } as unknown as NextRequest;

  return {
    request,
    jeTijeloProcitano: () => tijeloProcitano,
  };
}

async function pozoviPost(
  zahtjev: ReturnType<typeof napraviZahtjev>,
  zadatakId = ZADATAK_ID,
) {
  return POST(zahtjev.request, {
    params: Promise.resolve({ zadatakId }),
  });
}

/**
 * Simula las dos inserciones que realiza Kysely:
 * 1. Inserción de los metadatos de la tabla datoteka.
 * 2. Asociación del archivo con el zadatak.
 *
 * Se puede proporcionar un error para simular un fallo
 * durante la creación de la asociación.
 */
function napraviTransakcijuMock(
  greskaPovezivanja?: Error,
) {
  const izvrsiUmetanjeDatoteke = vi
    .fn()
    .mockResolvedValue({
      id: DATOTEKA_ID,
    });

  const izvrsiPovezivanje = greskaPovezivanja
    ? vi.fn().mockRejectedValue(greskaPovezivanja)
    : vi.fn().mockResolvedValue([]);

  const datotekaValues = vi.fn(() => ({
    returning: vi.fn(() => ({
      executeTakeFirstOrThrow:
        izvrsiUmetanjeDatoteke,
    })),
  }));

  const prilogValues = vi.fn(() => ({
    execute: izvrsiPovezivanje,
  }));

  const insertInto = vi.fn((tablica: string) => {
    if (tablica === "datoteka") {
      return {
        values: datotekaValues,
      };
    }

    if (tablica === "zadatak_prilog") {
      return {
        values: prilogValues,
      };
    }

    throw new Error(
      `Tablica nije podržana u testu: ${tablica}`,
    );
  });

  return {
    tx: { insertInto },
    insertInto,
    izvrsiUmetanjeDatoteke,
    izvrsiPovezivanje,
  };
}

describe("POST /api/zadaci/[zadatakId]/prilozi", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(dohvatiProfil).mockResolvedValue(null);
    vi.mocked(ulogaNaKolegiju).mockResolvedValue(null);

    vi.mocked(upit).mockImplementation(
      async <T>() =>
        ({
          id: ZADATAK_ID,
          kolegij_id: KOLEGIJ_ID,
        }) as T,
    );
  });

  it("vraća 403 kada Origin nije valjan", async () => {
    const zahtjev = napraviZahtjev({
      origin: "https://evil.test",
    });

    const response = await pozoviPost(zahtjev);

    expect(response.status).toBe(403);
    expect(zahtjev.jeTijeloProcitano()).toBe(false);

    await expect(response.json()).resolves.toEqual({
      greska: "Neispravan zahtjev.",
    });
  });

  it("vraća 411 bez čitanja tijela kada nedostaje Content-Length", async () => {
    const zahtjev = napraviZahtjev({
      contentLength: null,
    });

    const response = await pozoviPost(zahtjev);

    expect(response.status).toBe(411);
    expect(zahtjev.jeTijeloProcitano()).toBe(false);

    await expect(response.json()).resolves.toEqual({
      greska:
        "Zahtjev mora sadržavati zaglavlje Content-Length.",
    });
  });

  it("vraća 413 kada je zahtjev prevelik", async () => {
    const zahtjev = napraviZahtjev({
      contentLength: String(22 * 1024 * 1024),
    });

    const response = await pozoviPost(zahtjev);

    expect(response.status).toBe(413);
    expect(zahtjev.jeTijeloProcitano()).toBe(false);

    await expect(response.json()).resolves.toEqual({
      greska: "Zahtjev je prevelik.",
    });
  });

  it("vraća 415 kada zahtjev nije multipart/form-data", async () => {
    const zahtjev = napraviZahtjev({
      contentType: "application/json",
    });

    const response = await pozoviPost(zahtjev);

    expect(response.status).toBe(415);
    expect(zahtjev.jeTijeloProcitano()).toBe(false);

    await expect(response.json()).resolves.toEqual({
      greska: "Zahtjev mora biti multipart/form-data.",
    });
  });

  it("vraća 400 kada ID zadatka nije valjan UUID", async () => {
    const zahtjev = napraviZahtjev();

    const response = await pozoviPost(
      zahtjev,
      "nije-uuid",
    );

    expect(response.status).toBe(400);
    expect(zahtjev.jeTijeloProcitano()).toBe(false);

    await expect(response.json()).resolves.toEqual({
      greska: "Neispravan sadržaj zahtjeva.",
    });
  });

  it("vraća 401 kada korisnik nije prijavljen", async () => {
    const zahtjev = napraviZahtjev();

    vi.mocked(dohvatiProfil).mockResolvedValue(null);

    const response = await pozoviPost(zahtjev);

    expect(response.status).toBe(401);
    expect(zahtjev.jeTijeloProcitano()).toBe(false);

    await expect(response.json()).resolves.toEqual({
      greska: "Prijavite se za upravljanje prilozima.",
    });

    expect(upit).not.toHaveBeenCalled();
  });

  it("vraća 403 kada korisnik mora promijeniti lozinku", async () => {
    const zahtjev = napraviZahtjev();

    vi.mocked(dohvatiProfil).mockResolvedValue(
      profilNastavnika({
        moraPromijenitiLozinku: true,
      }),
    );

    const response = await pozoviPost(zahtjev);

    expect(response.status).toBe(403);
    expect(zahtjev.jeTijeloProcitano()).toBe(false);

    await expect(response.json()).resolves.toEqual({
      greska:
        "Prije nastavka morate promijeniti lozinku.",
    });

    expect(upit).not.toHaveBeenCalled();
  });

  it("skriva zadatak od korisnika koji nije osoblje", async () => {
    const zahtjev = napraviZahtjev();

    vi.mocked(dohvatiProfil).mockResolvedValue(
      profilNastavnika({
        osoblje: null,
        student: {
          id: "55555555-5555-4555-8555-555555555555",
          jmbag: "1234567890",
          ime: "Student",
          prezime: "Studentić",
        },
      }),
    );

    const response = await pozoviPost(zahtjev);

    expect(response.status).toBe(404);
    expect(zahtjev.jeTijeloProcitano()).toBe(false);
    expect(upit).not.toHaveBeenCalled();

    await expect(response.json()).resolves.toEqual({
      greska:
        "Zadatak nije pronađen ili nemate ovlasti.",
    });
  });

  it("odbija asistenta koji pokušava dodati prilog", async () => {
    const zahtjev = napraviZahtjev();

    vi.mocked(dohvatiProfil).mockResolvedValue(
      profilNastavnika(),
    );

    vi.mocked(ulogaNaKolegiju).mockResolvedValue(
      "asistent",
    );

    const response = await pozoviPost(zahtjev);

    expect(response.status).toBe(404);
    expect(zahtjev.jeTijeloProcitano()).toBe(false);

    expect(ulogaNaKolegiju).toHaveBeenCalledWith(
      KOLEGIJ_ID,
    );

    await expect(response.json()).resolves.toEqual({
      greska:
        "Zadatak nije pronađen ili nemate ovlasti.",
    });
  });

  it("traži datoteku od ovlaštenog nastavnika", async () => {
    const forma = new FormData();
    forma.set("locale", "hr");

    const zahtjev = napraviZahtjev({ forma });

    vi.mocked(dohvatiProfil).mockResolvedValue(
      profilNastavnika(),
    );

    vi.mocked(ulogaNaKolegiju).mockResolvedValue(
      "nastavnik",
    );

    const response = await pozoviPost(zahtjev);

    expect(response.status).toBe(400);
    expect(zahtjev.jeTijeloProcitano()).toBe(true);

    await expect(response.json()).resolves.toEqual({
      greska: "Odaberite datoteku.",
    });
  });

  it("odbija datoteku s nedopuštenom ekstenzijom prije spremanja", async () => {
    const forma = new FormData();

    forma.set("locale", "hr");
    forma.set(
      "datoteka",
      new File(
        ["neki sadržaj"],
        "zlonamjerna.exe",
        { type: "application/octet-stream" },
      ),
    );

    const zahtjev = napraviZahtjev({ forma });

    vi.mocked(dohvatiProfil).mockResolvedValue(
      profilNastavnika(),
    );

    vi.mocked(ulogaNaKolegiju).mockResolvedValue(
      "nastavnik",
    );

    const response = await pozoviPost(zahtjev);

    expect(response.status).toBe(400);

    await expect(response.json()).resolves.toEqual({
      greska: "Ova vrsta datoteke nije dopuštena.",
    });

    expect(spremiMock).not.toHaveBeenCalled();
  });

  it("sprema valjanu datoteku i povezuje je sa zadatkom", async () => {
    const forma = new FormData();
    forma.set("locale", "hr");

    const datoteka = new File(
      ["Primjer teksta za zadatak."],
      "zadatak.txt",
      { type: "text/plain" },
    );

    forma.set("datoteka", datoteka);

    const zahtjev = napraviZahtjev({ forma });
    const transakcija = napraviTransakcijuMock();

    vi.mocked(dohvatiProfil).mockResolvedValue(
      profilNastavnika(),
    );

    vi.mocked(ulogaNaKolegiju).mockResolvedValue(
      "nastavnik",
    );

    // Prvi poziv upit() dohvaća zadatak.
    // Drugi izvršava transakcijski callback.
    vi.mocked(upit)
      .mockImplementationOnce(
        async <T>() =>
          ({
            id: ZADATAK_ID,
            kolegij_id: KOLEGIJ_ID,
          }) as T,
      )
      .mockImplementationOnce(
        async (fn) =>
          fn(
            transakcija.tx as never,
            profilNastavnika(),
          ),
      );

    const putanja = "test/prilozi/zadatak.txt";

    spremiMock.mockResolvedValue({
      putanja,
      velicina: datoteka.size,
      sha256: "a".repeat(64),
    });

    const response = await pozoviPost(zahtjev);

    expect(response.status).toBe(200);

    const tijelo = await response.json();

    expect(tijelo).toMatchObject({
      id: DATOTEKA_ID,
      naziv: "zadatak.txt",
      velicina: datoteka.size,
    });

    expect(typeof tijelo.mime).toBe("string");
    expect(spremiMock).toHaveBeenCalledTimes(1);

    expect(transakcija.insertInto).toHaveBeenNthCalledWith(
      1,
      "datoteka",
    );

    expect(transakcija.insertInto).toHaveBeenNthCalledWith(
      2,
      "zadatak_prilog",
    );

    expect(
      transakcija.izvrsiUmetanjeDatoteke,
    ).toHaveBeenCalledTimes(1);

    expect(
      transakcija.izvrsiPovezivanje,
    ).toHaveBeenCalledTimes(1);

    expect(obrisiMock).not.toHaveBeenCalled();
  });

  it("briše fizičku datoteku kada upis u bazu ne uspije", async () => {
    const forma = new FormData();
    forma.set("locale", "hr");

    forma.set(
      "datoteka",
      new File(
        ["Primjer teksta za zadatak."],
        "zadatak.txt",
        { type: "text/plain" },
      ),
    );

    const zahtjev = napraviZahtjev({ forma });

    const greskaPovezivanja = new Error(
      "Simulirana greška baze podataka.",
    );

    const transakcija = napraviTransakcijuMock(
      greskaPovezivanja,
    );

    vi.mocked(dohvatiProfil).mockResolvedValue(
      profilNastavnika(),
    );

    vi.mocked(ulogaNaKolegiju).mockResolvedValue(
      "nastavnik",
    );

    vi.mocked(upit)
      .mockImplementationOnce(
        async <T>() =>
          ({
            id: ZADATAK_ID,
            kolegij_id: KOLEGIJ_ID,
          }) as T,
      )
      .mockImplementationOnce(
        async (fn) =>
          fn(
            transakcija.tx as never,
            profilNastavnika(),
          ),
      );

    const putanja = "test/prilozi/zadatak.txt";

    spremiMock.mockResolvedValue({
      putanja,
      velicina: 27,
      sha256: "b".repeat(64),
    });

    const response = await pozoviPost(zahtjev);

    expect(response.status).toBe(500);
    expect(spremiMock).toHaveBeenCalledTimes(1);

    expect(
      transakcija.izvrsiUmetanjeDatoteke,
    ).toHaveBeenCalledTimes(1);

    expect(
      transakcija.izvrsiPovezivanje,
    ).toHaveBeenCalledTimes(1);

    expect(obrisiMock).toHaveBeenCalledWith(putanja);
  });
});