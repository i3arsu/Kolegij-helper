import { describe, expect, it } from "vitest";
import { generirajPonavljajuce } from "@/lib/domena/termini";
import { postotakDolaznosti } from "@/lib/domena/dolaznost";
import { formatVrijeme, lokalnoUTrenutak } from "@/lib/domena/vrijeme";

describe("vrijeme u Zagrebu", () => {
  it("ljetno (UTC+2) i zimsko (UTC+1) računanje", () => {
    expect(lokalnoUTrenutak("2026-07-01", "10:00").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(lokalnoUTrenutak("2026-12-01", "10:00").toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });
});

describe("generirajPonavljajuce", () => {
  it("tjedni termini zadržavaju lokalno vrijeme preko prijelaza na zimsko (25. 10. 2026.)", () => {
    const t = generirajPonavljajuce({ odDatuma: "2026-10-19", doDatuma: "2026-11-02", danUTjednu: 1, vrijemeOd: "10:00", vrijemeDo: "11:30" });
    expect(t).toHaveLength(3);
    expect(t.map((x) => formatVrijeme(x.pocetak))).toEqual(["10:00", "10:00", "10:00"]);
    expect(t[0].pocetak.toISOString()).toBe("2026-10-19T08:00:00.000Z");
    expect(t[2].pocetak.toISOString()).toBe("2026-11-02T09:00:00.000Z");
  });

  it("počinje od prvog odabranog dana u tjednu", () => {
    const t = generirajPonavljajuce({ odDatuma: "2026-10-09", doDatuma: "2026-10-20", danUTjednu: 3, vrijemeOd: "12:00", vrijemeDo: "13:00" });
    expect(t.map((x) => x.pocetak.toISOString().slice(0, 10))).toEqual(["2026-10-14"]);
  });

  it("odbija kraj prije početka", () => {
    expect(() => generirajPonavljajuce({ odDatuma: "2026-10-01", doDatuma: "2026-10-30", danUTjednu: 1, vrijemeOd: "12:00", vrijemeDo: "11:00" })).toThrow();
  });
});

describe("postotakDolaznosti", () => {
  it("bez održanih termina nema postotka", () => {
    expect(postotakDolaznosti({ odrzano: 0, prisutan: 0, opravdano: 0 }, "izuzeto")).toBeNull();
    expect(postotakDolaznosti({ odrzano: 2, prisutan: 0, opravdano: 2 }, "izuzeto")).toBeNull();
  });
  it("zaokružuje na jednu decimalu kao baza", () => {
    expect(postotakDolaznosti({ odrzano: 3, prisutan: 2, opravdano: 0 }, "kao_odsutan")).toBe(66.7);
  });
});
