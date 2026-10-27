
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import {
  upit,
  zahtijevajNastavnika,
} from "@/lib/auth/guard";
import { lokalnoUTrenutak } from "@/lib/domena/vrijeme";
import {
  spremiProduzenjeRoka,
  ukloniProduzenjeRoka,
} from "@/lib/servisi/produzenja-roka";

import {
  spremiProduzenjeRokaAkcija,
} from "@/app/[locale]/nastava/[kolegijId]/zadaci/[zadatakId]/akcije-produzenja-roka";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({
  upit: vi.fn(),
  zahtijevajNastavnika: vi.fn(),
}));

vi.mock("@/lib/servisi/produzenja-roka", () => ({
  spremiProduzenjeRoka: vi.fn(),
  ukloniProduzenjeRoka: vi.fn(),
}));

const KOLEGIJ_ID =
  "33333333-3333-4333-8333-333333333333";

const ZADATAK_ID =
  "11111111-1111-4111-8111-111111111111";

const STUDENT_ID =
  "55555555-5555-4555-8555-555555555555";

const PROFESOR_ID =
  "22222222-2222-4222-8222-222222222222";

function napraviTransakciju(izvorniRok: Date) {
  const upitZaDodjelu = {
    innerJoin: vi.fn(),
    select: vi.fn(),
    where: vi.fn(),
    executeTakeFirst: vi.fn().mockResolvedValue({
      izvorni_rok: izvorniRok,
    }),
  };

  upitZaDodjelu.innerJoin.mockImplementation(
    () => upitZaDodjelu,
  );

  upitZaDodjelu.select.mockImplementation(
    () => upitZaDodjelu,
  );

  upitZaDodjelu.where.mockImplementation(
    () => upitZaDodjelu,
  );

  return {
    selectFrom: vi.fn(() => upitZaDodjelu),
    upitZaDodjelu,
  };
}

function napraviFormu(
  datum: string,
  vrijeme: string,
): FormData {
  const forma = new FormData();

  forma.set("locale", "hr");
  forma.set("datum", datum);
  forma.set("vrijeme", vrijeme);
  forma.set("razlog", "Odobrena dodatna vremena");

  return forma;
}

describe("spremiProduzenjeRokaAkcija", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(zahtijevajNastavnika).mockResolvedValue(
      undefined as never,
    );

    vi.mocked(getTranslations).mockResolvedValue(
      ((kljuc: string) => kljuc) as never,
    );

    vi.mocked(spremiProduzenjeRoka).mockResolvedValue(
      undefined,
    );

    vi.mocked(ukloniProduzenjeRoka).mockResolvedValue(
      undefined,
    );

    vi.mocked(revalidatePath).mockImplementation(
      () => {},
    );
  });

  it.each([
    {
      naziv: "datum prije izvornog roka",
      datum: "2030-01-05",
      vrijeme: "12:00",
      izvorniRok: lokalnoUTrenutak(
        "2030-01-06",
        "12:00",
      ),
    },
    {
      naziv: "datum jednak izvornom roku",
      datum: "2030-01-05",
      vrijeme: "12:00",
      izvorniRok: lokalnoUTrenutak(
        "2030-01-05",
        "12:00",
      ),
    },
  ])(
    "odbija produljenje kada je $naziv",
    async ({ datum, vrijeme, izvorniRok }) => {
      const transakcija = napraviTransakciju(
        izvorniRok,
      );

      vi.mocked(upit).mockImplementation(
        async (fn) =>
          fn(
            transakcija as never,
            {
              korisnikId: PROFESOR_ID,
            } as never,
          ),
      );

      const rezultat =
        await spremiProduzenjeRokaAkcija(
          KOLEGIJ_ID,
          ZADATAK_ID,
          STUDENT_ID,
          {},
          napraviFormu(datum, vrijeme),
        );

      expect(rezultat).toEqual({
        greska: "validation.mustBeAfterDeadline",
      });

      expect(spremiProduzenjeRoka).not.toHaveBeenCalled();

      expect(revalidatePath).not.toHaveBeenCalled();

      expect(transakcija.selectFrom).toHaveBeenCalledWith(
        "v_predaja as vp",
      );

      expect(
        transakcija.upitZaDodjelu.executeTakeFirst,
      ).toHaveBeenCalledTimes(1);
    },
  );
});