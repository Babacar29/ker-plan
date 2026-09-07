import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import { projets, users } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { hashMotDePasse } from "./auth";
import { creerProjet, dupliquerProjet, obtenirProjet, listerProjets, supprimerProjet, type CreationProjet } from "./projets";

const INPUT_BASE: CreationProjet = {
  nom: "Maison test",
  surfaceTerrainM2: 300,
  surfaceBatieM2: 120,
  typeStructure: "parpaing",
  nbNiveaux: 1,
  typeToiture: "dalle_beton",
  standing: "moyen",
  modeBriques: "usine",
  reponsesQuestionnaire: {
    nbChambres: 3,
    salonOuvertSurCuisine: false,
    nbChambresAvecToiletteInterne: 1,
    toilettesVisiteurs: true,
    nbCouleurs: 1,
  },
};

let testUserId: number;
const createdProjetIds: number[] = [];

beforeAll(async () => {
  const hash = await hashMotDePasse("test-projets-pwd");
  const [user] = await db
    .insert(users)
    .values({ email: `projets-test-${Date.now()}@kerplan.test`, passwordHash: hash })
    .returning();
  testUserId = user.id;
});

afterAll(async () => {
  if (createdProjetIds.length > 0) {
    await db.delete(projets).where(inArray(projets.id, createdProjetIds));
  }
  await db.delete(users).where(eq(users.id, testUserId));
});

describe("creerProjet", () => {
  it("crée un projet avec plan généré", async () => {
    const projet = await creerProjet(INPUT_BASE, testUserId);
    createdProjetIds.push(projet.id);

    expect(projet.nom).toBe("Maison test");
    expect(projet.userId).toBe(testUserId);
    expect(projet.planGenere).not.toBeNull();
  });
});

describe("obtenirProjet", () => {
  it("retourne le projet par id et userId", async () => {
    const projet = await creerProjet(INPUT_BASE, testUserId);
    createdProjetIds.push(projet.id);

    const found = await obtenirProjet(projet.id, testUserId);
    expect(found?.id).toBe(projet.id);
  });

  it("retourne undefined pour un userId différent", async () => {
    const projet = await creerProjet(INPUT_BASE, testUserId);
    createdProjetIds.push(projet.id);

    const found = await obtenirProjet(projet.id, testUserId + 99999);
    expect(found).toBeUndefined();
  });
});

describe("listerProjets", () => {
  it("retourne les projets du user triés par date décroissante", async () => {
    const p1 = await creerProjet({ ...INPUT_BASE, nom: "Premier" }, testUserId);
    createdProjetIds.push(p1.id);
    const p2 = await creerProjet({ ...INPUT_BASE, nom: "Deuxième" }, testUserId);
    createdProjetIds.push(p2.id);

    const liste = await listerProjets(testUserId);
    const ids = liste.map((p) => p.id);
    expect(ids.indexOf(p2.id)).toBeLessThan(ids.indexOf(p1.id));
  });
});

describe("dupliquerProjet", () => {
  it("crée une copie avec ' (copie)' dans le nom", async () => {
    const original = await creerProjet(INPUT_BASE, testUserId);
    createdProjetIds.push(original.id);

    const copie = await dupliquerProjet(original.id, testUserId);
    expect(copie).toBeDefined();
    createdProjetIds.push(copie!.id);

    expect(copie!.nom).toBe("Maison test (copie)");
    expect(copie!.id).not.toBe(original.id);
  });

  it("copie tous les champs de construction", async () => {
    const original = await creerProjet(INPUT_BASE, testUserId);
    createdProjetIds.push(original.id);

    const copie = await dupliquerProjet(original.id, testUserId);
    createdProjetIds.push(copie!.id);

    expect(copie!.surfaceTerrainM2).toBe(original.surfaceTerrainM2);
    expect(copie!.surfaceBatieM2).toBe(original.surfaceBatieM2);
    expect(copie!.typeStructure).toBe(original.typeStructure);
    expect(copie!.nbNiveaux).toBe(original.nbNiveaux);
    expect(copie!.typeToiture).toBe(original.typeToiture);
    expect(copie!.standing).toBe(original.standing);
    expect(copie!.modeBriques).toBe(original.modeBriques);
    expect(copie!.planGenere).toEqual(original.planGenere);
  });

  it("retourne undefined si le projet n'existe pas", async () => {
    const copie = await dupliquerProjet(999999, testUserId);
    expect(copie).toBeUndefined();
  });

  it("retourne undefined si le userId ne correspond pas", async () => {
    const original = await creerProjet(INPUT_BASE, testUserId);
    createdProjetIds.push(original.id);

    const copie = await dupliquerProjet(original.id, testUserId + 99999);
    expect(copie).toBeUndefined();
  });
});

describe("supprimerProjet", () => {
  it("supprime le projet", async () => {
    const projet = await creerProjet(INPUT_BASE, testUserId);
    createdProjetIds.push(projet.id);

    await supprimerProjet(projet.id, testUserId);
    const found = await obtenirProjet(projet.id, testUserId);
    expect(found).toBeUndefined();
  });
});
