import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { db } from "@/db";
import { plansReference } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { ratioPiece, enregistrerExtraction, obtenirPlanReference, creerPlanReferenceBrouillon, mapperTypeExtrait, calculerRatiosDepuisBanque, validerPlanReference } from "./banque-plans";

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

describe("mapperTypeExtrait", () => {
  it("mappe les libellés connus vers TypePiece", () => {
    expect(mapperTypeExtrait("chambre")).toBe("chambre");
    expect(mapperTypeExtrait("salon")).toBe("salon");
    expect(mapperTypeExtrait("cuisine")).toBe("cuisine");
    expect(mapperTypeExtrait("sdb")).toBe("sdb");
    expect(mapperTypeExtrait("wc")).toBe("wc");
    expect(mapperTypeExtrait("circulation")).toBe("circulation");
  });

  it("est insensible à la casse", () => {
    expect(mapperTypeExtrait("Chambre")).toBe("chambre");
  });

  it("retourne null pour un libellé non reconnu", () => {
    expect(mapperTypeExtrait("cour")).toBeNull();
    expect(mapperTypeExtrait("garage")).toBeNull();
  });
});

describe("calculerRatiosDepuisBanque", () => {
  let createdPlanIds: number[] = [];

  beforeAll(async () => {
    // Clean up any leftover validated plans from previous test runs
    const allPlans = await db.select().from(plansReference);
    const validatedIds = allPlans.filter((p) => p.statut === "valide").map((p) => p.id);
    if (validatedIds.length > 0) {
      await db.delete(plansReference).where(inArray(plansReference.id, validatedIds));
    }
  });

  beforeEach(() => {
    createdPlanIds = [];
  });

  afterEach(async () => {
    if (createdPlanIds.length > 0) {
      await db.delete(plansReference).where(inArray(plansReference.id, createdPlanIds));
    }
  });

  it("retourne un mapping vide si aucun plan validé", async () => {
    const ratios = await calculerRatiosDepuisBanque();
    expect(ratios).toEqual({});
  });

  it("calcule la moyenne des ratios sur plusieurs plans validés", async () => {
    const plan1 = await creerPlanReferenceBrouillon("https://example.com/p1.png");
    createdPlanIds.push(plan1.id);
    await enregistrerExtraction(plan1.id, {
      empriseM2: 100,
      largeurM: 10,
      profondeurM: 10,
      nbNiveaux: 1,
      pieces: [
        { nom: "Salon", typeExtrait: "salon", surfaceM2: 20, niveauIndex: 0, xM: 0, yM: 0, largeurM: 5, profondeurM: 4 },
      ],
    });
    await validerPlanReference(plan1.id);

    const plan2 = await creerPlanReferenceBrouillon("https://example.com/p2.png");
    createdPlanIds.push(plan2.id);
    await enregistrerExtraction(plan2.id, {
      empriseM2: 200,
      largeurM: 14,
      profondeurM: 14,
      nbNiveaux: 1,
      pieces: [
        { nom: "Salon", typeExtrait: "salon", surfaceM2: 60, niveauIndex: 0, xM: 0, yM: 0, largeurM: 8, profondeurM: 7 },
      ],
    });
    await validerPlanReference(plan2.id);

    const ratios = await calculerRatiosDepuisBanque();
    // (0.20 + 0.30) / 2 = 0.25
    expect(ratios.salon).toBeCloseTo(0.25, 5);
  });
});
