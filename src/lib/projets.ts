import { db } from "@/db";
import { projets, type Projet, type NouveauProjet } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { genererPlan, genererPlanDepuisReference, type ReponsesQuestionnaire, type Plan } from "./plan-generator";
import { obtenirRatio } from "./params";
import { calculerRatiosDepuisBanque, obtenirPlanReference } from "./banque-plans";

const CLE_RATIO_CIRCULATION = "ratio_circulation_par_m2_batie";

export type CreationProjet = {
  nom: string;
  surfaceTerrainM2: number;
  surfaceBatieM2: number;
  typeStructure: NouveauProjet["typeStructure"];
  nbNiveaux: number;
  typeToiture: NouveauProjet["typeToiture"];
  standing: NouveauProjet["standing"];
  modeBriques: NouveauProjet["modeBriques"];
  reponsesQuestionnaire: ReponsesQuestionnaire;
  planReferenceId?: number | null;
};

/** Génère le plan d'un projet : copie exacte si un planReferenceId est
 * fourni et éligible, sinon génération par ratios (dérivés de la banque
 * de plans validés si disponible, sinon constantes par défaut). */
async function genererPlanPourProjet(input: CreationProjet): Promise<Plan> {
  if (input.planReferenceId) {
    const reference = await obtenirPlanReference(input.planReferenceId);
    if (reference) {
      return genererPlanDepuisReference(reference, input.surfaceBatieM2, input.nbNiveaux);
    }
  }
  const ratioCirculation = await obtenirRatio(CLE_RATIO_CIRCULATION);
  const ratios = await calculerRatiosDepuisBanque();
  return genererPlan(input.reponsesQuestionnaire, input.surfaceBatieM2, input.nbNiveaux, ratioCirculation, ratios);
}

export async function listerProjets(userId: number): Promise<Projet[]> {
  return db
    .select()
    .from(projets)
    .where(eq(projets.userId, userId))
    .orderBy(desc(projets.createdAt));
}

export async function obtenirProjet(id: number, userId: number): Promise<Projet | undefined> {
  const [projet] = await db
    .select()
    .from(projets)
    .where(and(eq(projets.id, id), eq(projets.userId, userId)));
  return projet;
}

/** Crée un projet et génère son plan immédiatement à partir du questionnaire. */
export async function creerProjet(input: CreationProjet, userId: number): Promise<Projet> {
  const plan = await genererPlanPourProjet(input);

  const [projet] = await db
    .insert(projets)
    .values({
      userId,
      nom: input.nom,
      surfaceTerrainM2: String(input.surfaceTerrainM2),
      surfaceBatieM2: String(input.surfaceBatieM2),
      typeStructure: input.typeStructure,
      nbNiveaux: input.nbNiveaux,
      typeToiture: input.typeToiture,
      standing: input.standing,
      modeBriques: input.modeBriques,
      reponsesQuestionnaire: input.reponsesQuestionnaire,
      planReferenceId: input.planReferenceId ?? null,
      planGenere: plan,
    })
    .returning();

  return projet;
}

export async function supprimerProjet(id: number, userId: number): Promise<void> {
  await db.delete(projets).where(and(eq(projets.id, id), eq(projets.userId, userId)));
}

/** Met à jour un projet et régénère son plan à partir du questionnaire modifié. */
export async function modifierProjet(
  id: number,
  input: CreationProjet,
  userId: number
): Promise<Projet | undefined> {
  const plan = await genererPlanPourProjet(input);

  const [projet] = await db
    .update(projets)
    .set({
      nom: input.nom,
      surfaceTerrainM2: String(input.surfaceTerrainM2),
      surfaceBatieM2: String(input.surfaceBatieM2),
      typeStructure: input.typeStructure,
      nbNiveaux: input.nbNiveaux,
      typeToiture: input.typeToiture,
      standing: input.standing,
      modeBriques: input.modeBriques,
      reponsesQuestionnaire: input.reponsesQuestionnaire,
      planReferenceId: input.planReferenceId ?? null,
      planGenere: plan,
      updatedAt: new Date(),
    })
    .where(and(eq(projets.id, id), eq(projets.userId, userId)))
    .returning();

  return projet;
}
