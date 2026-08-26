import { describe, it, expect } from "vitest";
import { genererPlan, genererPlanDepuisReference, type ReponsesQuestionnaire } from "./plan-generator";
import type { PlanReferenceAvecPieces } from "./banque-plans";

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

function planReferenceTest(): PlanReferenceAvecPieces {
  return {
    plan: {
      id: 1,
      source: null,
      imageUrl: "https://example.com/p.png",
      empriseM2: "100.00",
      largeurM: "10.00",
      profondeurM: "10.00",
      nbNiveaux: 1,
      statut: "valide",
      createdAt: new Date(),
    },
    pieces: [
      {
        id: 1, planReferenceId: 1, typeExtrait: "salon", nom: "Salon", surfaceM2: "20.00",
        niveauIndex: 0, xM: "0.00", yM: "0.00", largeurM: "5.00", profondeurM: "4.00",
      },
      {
        id: 2, planReferenceId: 1, typeExtrait: "chambre", nom: "Chambre 1", surfaceM2: "16.00",
        niveauIndex: 0, xM: "5.00", yM: "0.00", largeurM: "4.00", profondeurM: "4.00",
      },
    ],
  };
}

describe("genererPlanDepuisReference", () => {
  it("met à l'échelle les positions/dimensions par racine du ratio de surface", () => {
    const plan = genererPlanDepuisReference(planReferenceTest(), 400, 1); // 4x la surface -> k=2
    const salon = plan.niveaux[0].pieces.find((p) => p.nom === "Salon")!;
    expect(salon.rect.width).toBeCloseTo(10, 5);
    expect(salon.rect.height).toBeCloseTo(8, 5);
    expect(salon.type).toBe("salon");
  });

  it("tronque les niveaux excédentaires quand nbNiveauxCible < niveaux de référence", () => {
    const reference = planReferenceTest();
    reference.plan.nbNiveaux = 2;
    reference.pieces.push({
      id: 3, planReferenceId: 1, typeExtrait: "chambre", nom: "Chambre étage", surfaceM2: "12.00",
      niveauIndex: 1, xM: "0.00", yM: "0.00", largeurM: "3.00", profondeurM: "4.00",
    });
    const plan = genererPlanDepuisReference(reference, 100, 1);
    expect(plan.niveaux).toHaveLength(1);
    expect(plan.niveaux[0].index).toBe(0);
  });

  it("duplique le dernier niveau quand nbNiveauxCible > niveaux de référence", () => {
    const plan = genererPlanDepuisReference(planReferenceTest(), 100, 2);
    expect(plan.niveaux).toHaveLength(2);
    expect(plan.niveaux[1].index).toBe(1);
    expect(plan.niveaux[1].pieces.map((p) => p.nom)).toEqual(plan.niveaux[0].pieces.map((p) => p.nom));
  });

  it("lève une erreur si une pièce n'a pas de position complète", () => {
    const reference = planReferenceTest();
    reference.pieces[0].xM = null;
    expect(() => genererPlanDepuisReference(reference, 100, 1)).toThrow();
  });

  it("génère des ouvertures via genererPortes/genererFenetres réutilisés", () => {
    const plan = genererPlanDepuisReference(planReferenceTest(), 100, 1);
    expect(plan.niveaux[0].ouvertures.length).toBeGreaterThan(0);
  });
});
