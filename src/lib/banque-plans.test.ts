import { describe, it, expect } from "vitest";
import { ratioPiece, enregistrerExtraction, obtenirPlanReference, creerPlanReferenceBrouillon } from "./banque-plans";

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

describe("enregistrerExtraction (phase 2 : position)", () => {
  it("persiste niveauIndex et position par pièce", async () => {
    const plan = await creerPlanReferenceBrouillon("https://example.com/plan.png");
    await enregistrerExtraction(plan.id, {
      empriseM2: 100,
      largeurM: 10,
      profondeurM: 10,
      nbNiveaux: 1,
      pieces: [
        {
          nom: "Salon",
          typeExtrait: "salon",
          surfaceM2: 20,
          niveauIndex: 0,
          xM: 0,
          yM: 0,
          largeurM: 5,
          profondeurM: 4,
        },
      ],
    });
    const resultat = await obtenirPlanReference(plan.id);
    expect(resultat?.pieces[0].niveauIndex).toBe(0);
    expect(Number(resultat?.pieces[0].xM)).toBe(0);
    expect(Number(resultat?.pieces[0].largeurM)).toBe(5);
  });
});
