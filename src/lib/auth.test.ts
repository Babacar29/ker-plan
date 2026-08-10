import { describe, it, expect } from "vitest";
import { hashMotDePasse, verifierMotDePasse, genererTokenSession } from "./auth";

describe("hashMotDePasse / verifierMotDePasse", () => {
  it("hash puis vérifie un mot de passe correct", async () => {
    const hash = await hashMotDePasse("motdepasse123");
    expect(await verifierMotDePasse("motdepasse123", hash)).toBe(true);
  });

  it("rejette un mot de passe incorrect", async () => {
    const hash = await hashMotDePasse("motdepasse123");
    expect(await verifierMotDePasse("mauvais", hash)).toBe(false);
  });

  it("produit des hash différents pour le même mot de passe (salt aléatoire)", async () => {
    const hash1 = await hashMotDePasse("motdepasse123");
    const hash2 = await hashMotDePasse("motdepasse123");
    expect(hash1).not.toBe(hash2);
  });
});

describe("genererTokenSession", () => {
  it("génère un token hex de 64 caractères (32 bytes)", () => {
    const token = genererTokenSession();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("génère des tokens différents à chaque appel", () => {
    expect(genererTokenSession()).not.toBe(genererTokenSession());
  });
});
