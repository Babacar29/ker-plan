import { db } from "@/db";
import { projets, type Projet, type NouveauProjet } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { genererPlan, type ReponsesQuestionnaire } from "./plan-generator";

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
};

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
  const plan = genererPlan(input.reponsesQuestionnaire, input.surfaceBatieM2, input.nbNiveaux);

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
      planGenere: plan,
    })
    .returning();

  return projet;
}

export async function supprimerProjet(id: number, userId: number): Promise<void> {
  await db.delete(projets).where(and(eq(projets.id, id), eq(projets.userId, userId)));
}
