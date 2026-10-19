
import type { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/predaje/[zadatakId]/route";

describe("POST /api/predaje/[zadatakId]", () => {
  it("vraća 411 bez čitanja tijela kada nedostaje Content-Length", async () => {
    let tijeloProcitano = false;

    const url = new URL(
      "https://example.test/api/predaje/11111111-1111-4111-8111-111111111111",
    );

    const request = {
      headers: new Headers({
        origin: url.origin,
        "content-type": "multipart/form-data; boundary=test",
      }),
      nextUrl: url,
      formData: async () => {
        tijeloProcitano = true;
        throw new Error("Tijelo se nije smjelo čitati.");
      },
    } as unknown as NextRequest;

    const response = await POST(request, {
      params: Promise.resolve({
        zadatakId: "11111111-1111-4111-8111-111111111111",
      }),
    });

    expect(response.status).toBe(411);
    expect(tijeloProcitano).toBe(false);
    await expect(response.json()).resolves.toEqual({
      greska: "Zahtjev mora sadržavati zaglavlje Content-Length.",
    });
  });
});
