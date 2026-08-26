import { describe, it, expect, vi } from "vitest";

const generateTextMock = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  Output: { object: (config: unknown) => ({ type: "object", ...(config as object) }) },
}));

import { extraireDonneesPlan, SchemaExtractionPlan } from "./extraction-plan";

describe("extraireDonneesPlan", () => {
  it("retourne l'objet extrait validé par le schéma", async () => {
    const donnees = {
      empriseM2: 120,
      largeurM: 10,
      profondeurM: 12,
      nbNiveaux: 1,
      pieces: [
        { nom: "Salon", typeExtrait: "salon", surfaceM2: 25 },
        { nom: "CH1", typeExtrait: "chambre", surfaceM2: 12 },
      ],
    };
    generateTextMock.mockResolvedValue({ output: donnees });

    const resultat = await extraireDonneesPlan("https://blob.example/plan.png");

    expect(resultat).toEqual(donnees);
    expect(SchemaExtractionPlan.safeParse(resultat).success).toBe(true);
  });

  it("rejette une réponse dont le schéma est invalide", async () => {
    generateTextMock.mockResolvedValue({
      output: { empriseM2: "pas un nombre", pieces: [] },
    });

    await expect(extraireDonneesPlan("https://blob.example/plan.png")).rejects.toThrow();
  });

  it("propage l'erreur si le modèle échoue", async () => {
    generateTextMock.mockRejectedValue(new Error("timeout"));

    await expect(extraireDonneesPlan("https://blob.example/plan.png")).rejects.toThrow("timeout");
  });
});
