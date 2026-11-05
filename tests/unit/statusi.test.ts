import { describe, expect, it } from "vitest";
import { mozeStudentPredati } from "@/lib/domena/statusi";

describe("mozeStudentPredati", () => {
  it("dopušta predaju kada zadatak još nije predan", () => {
    expect(mozeStudentPredati("nije_predano")).toBe(true);
  });

  it("dopušta zamjenu postojeće predaje", () => {
    expect(mozeStudentPredati("predano")).toBe(true);
  });

  it("dopušta novu verziju nakon vraćanja na doradu", () => {
    expect(mozeStudentPredati("vraceno_na_doradu")).toBe(true);
  });

  it("ne dopušta izmjenu predaje koja je u pregledu", () => {
    expect(mozeStudentPredati("u_pregledu")).toBe(false);
  });

  it("ne dopušta izmjenu prihvaćene predaje", () => {
    expect(mozeStudentPredati("prihvaceno")).toBe(false);
  });

  it("ne dopušta predaju bez poznatog statusa", () => {
    expect(mozeStudentPredati(null)).toBe(false);
  });
});