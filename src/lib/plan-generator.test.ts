import { describe, it, expect } from "vitest";
import { genererPlan, type ReponsesQuestionnaire } from "./plan-generator";

const REPONSES: ReponsesQuestionnaire = {
  nbChambres: 2,
  salonOuvertSurCuisine: false,
  nbChambresAvecToiletteInterne: 0,
  toilettesVisiteurs: false,
  nbCouleurs: 1,
};

describe("genererPlan avec ratios personnalisés", () => {
  it("utilise le ratio fourni pour le salon au lieu de la constante par défaut", () => {
    const planDefaut = genererPlan(REPONSES, 100, 1);
    const salonDefaut = planDefaut.niveaux[0].pieces.find((p) => p.id === "salon")!;
    const surfaceDefaut = salonDefaut.rect.width * salonDefaut.rect.height;

    const planPersonnalise = genererPlan(REPONSES, 100, 1, undefined, { salon: 0.4 });
    const salonPersonnalise = planPersonnalise.niveaux[0].pieces.find((p) => p.id === "salon")!;
    const surfacePersonnalisee = salonPersonnalise.rect.width * salonPersonnalise.rect.height;

    expect(surfacePersonnalisee).toBeGreaterThan(surfaceDefaut);
  });

  it("retombe sur la constante par défaut pour un type absent du mapping", () => {
    const planDefaut = genererPlan(REPONSES, 100, 1);
    const planPartiel = genererPlan(REPONSES, 100, 1, undefined, { salon: 0.4 });
    const cuisineDefaut = planDefaut.niveaux[0].pieces.find((p) => p.id === "cuisine")!;
    const cuisinePartielle = planPartiel.niveaux[0].pieces.find((p) => p.id === "cuisine")!;
    expect(cuisinePartielle.rect.width * cuisinePartielle.rect.height).toBeCloseTo(
      cuisineDefaut.rect.width * cuisineDefaut.rect.height,
      5
    );
  });
});
