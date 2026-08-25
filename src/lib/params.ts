import { db } from "@/db";
import { materiaux, mainOeuvre, ratiosConstruction } from "@/db/schema";
import { eq } from "drizzle-orm";

/** Point d'accès unique aux catalogues de paramètres — masque Drizzle aux appelants. */
export async function chargerCatalogues() {
  const [listeMateriaux, listeMainOeuvre, listeRatios] = await Promise.all([
    db.select().from(materiaux),
    db.select().from(mainOeuvre),
    db.select().from(ratiosConstruction),
  ]);
  return { materiaux: listeMateriaux, mainOeuvre: listeMainOeuvre, ratios: listeRatios };
}

/** Lit un ratio unique par clé — utilisé par le générateur de plan hors du contexte /parametres. */
export async function obtenirRatio(cle: string): Promise<number | undefined> {
  const [ratio] = await db.select().from(ratiosConstruction).where(eq(ratiosConstruction.cle, cle));
  return ratio ? Number(ratio.valeur) : undefined;
}

export async function mettreAJourPrixMateriau(id: number, prixUnitaireFcfa: number) {
  await db.update(materiaux).set({ prixUnitaireFcfa: String(prixUnitaireFcfa) }).where(eq(materiaux.id, id));
}

export async function mettreAJourForfaitMainOeuvre(id: number, forfaitFcfaM2: number) {
  await db.update(mainOeuvre).set({ forfaitFcfaM2: String(forfaitFcfaM2) }).where(eq(mainOeuvre.id, id));
}

export async function mettreAJourRatio(id: number, valeur: number) {
  await db.update(ratiosConstruction).set({ valeur: String(valeur) }).where(eq(ratiosConstruction.id, id));
}
