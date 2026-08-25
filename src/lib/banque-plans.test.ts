import { describe, it, expect } from "vitest";
import { ratioPiece } from "./banque-plans";

describe("ratioPiece", () => {
  it("calcule le ratio surface pièce / emprise", () => {
    expect(ratioPiece({ surfaceM2: 25 }, { empriseM2: 100 })).toBe(0.25);
  });

  it("accepte des valeurs numeric renvoyées par Drizzle en string", () => {
    expect(ratioPiece({ surfaceM2: "12.50" }, { empriseM2: "100.00" })).toBe(0.125);
  });

  it("retourne null si l'emprise est nulle", () => {
    expect(ratioPiece({ surfaceM2: 25 }, { empriseM2: null })).toBeNull();
  });

  it("retourne null si l'emprise vaut 0", () => {
    expect(ratioPiece({ surfaceM2: 25 }, { empriseM2: 0 })).toBeNull();
  });
});
