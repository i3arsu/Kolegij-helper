
import { describe, expect, it } from "vitest";

import {
  zaglavljePreuzimanja,
} from "@/lib/datoteke/zaglavlje-preuzimanja";

describe("zaglavlje preuzimanja", () => {
  it("kodira naziv datoteke s dijakriticima, razmacima i zagradama", () => {
    expect(
      zaglavljePreuzimanja("Zadaća 1 (konačno).pdf"),
    ).toBe(
      "attachment; filename=\"download\"; " +
        "filename*=UTF-8''Zada%C4%87a%201%20%28kona%C4%8Dno%29.pdf",
    );
  });
});
