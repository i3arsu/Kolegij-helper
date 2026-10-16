
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  obrisi,
  otvori,
  spremi,
} from "@/lib/datoteke/spremiste";

const KOLEGIJ = "11111111-1111-4111-8111-111111111111";
const ZADATAK = "22222222-2222-4222-8222-222222222222";
const VLASNIK = "33333333-3333-4333-8333-333333333333";

let privremeniDirektorij: string;
let prethodniDirektorij: string | undefined;

beforeEach(async () => {
  prethodniDirektorij = process.env.DATOTEKE_DIR;
  privremeniDirektorij = await mkdtemp(
    join(tmpdir(), "kolegij-datoteke-"),
  );
  process.env.DATOTEKE_DIR = privremeniDirektorij;
});

afterEach(async () => {
  await rm(privremeniDirektorij, {
    recursive: true,
    force: true,
  });

  if (prethodniDirektorij === undefined) {
    delete process.env.DATOTEKE_DIR;
  } else {
    process.env.DATOTEKE_DIR = prethodniDirektorij;
  }
});

describe("spremiste datoteka", () => {
  it("sprema sadržaj, računa veličinu i SHA-256", async () => {
    const bajtovi = new TextEncoder().encode("Primjer datoteke");
    const spremljeno = await spremi(bajtovi, {
      kolegijId: KOLEGIJ,
      zadatakId: ZADATAK,
      vlasnik: VLASNIK,
    });

    expect(spremljeno.velicina).toBe(bajtovi.byteLength);
    expect(spremljeno.sha256).toBe(
      createHash("sha256").update(bajtovi).digest("hex"),
    );

    const dijelovi = spremljeno.putanja.split("/");
    expect(dijelovi).toHaveLength(4);
    expect(dijelovi.slice(0, 3)).toEqual([
      KOLEGIJ,
      ZADATAK,
      VLASNIK,
    ]);

    const punaPutanja = resolve(
      privremeniDirektorij,
      ...dijelovi,
    );

    const relativnaPutanja = relative(
      privremeniDirektorij,
      punaPutanja,
    );

    expect(relativnaPutanja.startsWith("..")).toBe(false);
    expect(spremljeno.putanja).not.toContain("original.pdf");

    await expect(readFile(punaPutanja)).resolves.toEqual(
      Buffer.from(bajtovi),
    );
  });

  it("otvara spremljenu datoteku kao čitljiv stream", async () => {
    const sadržaj = "Sadržaj za čitanje";
    const spremljeno = await spremi(
      new TextEncoder().encode(sadržaj),
      {
        kolegijId: KOLEGIJ,
        zadatakId: ZADATAK,
        vlasnik: VLASNIK,
      },
    );

    const stream = await otvori(spremljeno.putanja);
    const dijelovi: Buffer[] = [];

    for await (const dio of stream) {
      dijelovi.push(Buffer.from(dio));
    }

    expect(Buffer.concat(dijelovi).toString("utf8")).toBe(
      sadržaj,
    );
  });

  it("briše datoteku i dopušta ponovno brisanje", async () => {
    const spremljeno = await spremi(
      new TextEncoder().encode("Za brisanje"),
      {
        kolegijId: KOLEGIJ,
        zadatakId: ZADATAK,
        vlasnik: VLASNIK,
      },
    );

    await obrisi(spremljeno.putanja);

    const punaPutanja = resolve(
      privremeniDirektorij,
      ...spremljeno.putanja.split("/"),
    );

    await expect(readFile(punaPutanja)).rejects.toMatchObject({
      code: "ENOENT",
    });

    await expect(obrisi(spremljeno.putanja)).resolves.toBeUndefined();
  });

  it("odbija putanje koje pokušavaju izaći iz spremišta", async () => {
    await expect(otvori("../izvan-spremista.txt")).rejects.toThrow();
    await expect(obrisi("../izvan-spremista.txt")).rejects.toThrow();
  });

  it("odbija nevaljane identifikatore prije spremanja", async () => {
    await expect(
      spremi(new Uint8Array([1]), {
        kolegijId: "../izvan-spremista",
        zadatakId: ZADATAK,
        vlasnik: VLASNIK,
      }),
    ).rejects.toThrow("Neispravan identifikator");
  });
});