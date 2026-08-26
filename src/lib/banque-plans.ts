import { db } from "@/db";
import { plansReference, plansReferencePieces } from "@/db/schema";
import type { PlanReference, PlanReferencePiece } from "@/db/schema";
import type { ExtractionPlan } from "@/lib/extraction-plan";
import { eq } from "drizzle-orm";

export function ratioPiece(
  piece: { surfaceM2: number | string },
  plan: { empriseM2: number | string | null }
): number | null {
  const emprise = Number(plan.empriseM2);
  if (!emprise) return null;
  return Number(piece.surfaceM2) / emprise;
}

export async function creerPlanReferenceBrouillon(
  imageUrl: string,
  source?: string
): Promise<PlanReference> {
  const [plan] = await db.insert(plansReference).values({ imageUrl, source }).returning();
  return plan;
}

export async function listerPlansReference(): Promise<PlanReference[]> {
  return db.select().from(plansReference).orderBy(plansReference.createdAt);
}

export async function obtenirPlanReference(
  id: number
): Promise<{ plan: PlanReference; pieces: PlanReferencePiece[] } | null> {
  const [plan] = await db.select().from(plansReference).where(eq(plansReference.id, id));
  if (!plan) return null;
  const pieces = await db
    .select()
    .from(plansReferencePieces)
    .where(eq(plansReferencePieces.planReferenceId, id));
  return { plan, pieces };
}

export async function enregistrerExtraction(id: number, donnees: ExtractionPlan): Promise<void> {
  await db
    .update(plansReference)
    .set({
      empriseM2: String(donnees.empriseM2),
      largeurM: String(donnees.largeurM),
      profondeurM: String(donnees.profondeurM),
      nbNiveaux: donnees.nbNiveaux,
    })
    .where(eq(plansReference.id, id));

  if (donnees.pieces.length > 0) {
    await db.insert(plansReferencePieces).values(
      donnees.pieces.map((p) => ({
        planReferenceId: id,
        nom: p.nom,
        typeExtrait: p.typeExtrait,
        surfaceM2: String(p.surfaceM2),
        niveauIndex: p.niveauIndex,
        xM: String(p.xM),
        yM: String(p.yM),
        largeurM: String(p.largeurM),
        profondeurM: String(p.profondeurM),
      }))
    );
  }
}

export async function mettreAJourPiece(
  id: number,
  champs: { nom?: string; typeExtrait?: string; surfaceM2?: number }
): Promise<void> {
  await db
    .update(plansReferencePieces)
    .set({
      ...(champs.nom !== undefined ? { nom: champs.nom } : {}),
      ...(champs.typeExtrait !== undefined ? { typeExtrait: champs.typeExtrait } : {}),
      ...(champs.surfaceM2 !== undefined ? { surfaceM2: String(champs.surfaceM2) } : {}),
    })
    .where(eq(plansReferencePieces.id, id));
}

export async function validerPlanReference(id: number): Promise<void> {
  await db.update(plansReference).set({ statut: "valide" }).where(eq(plansReference.id, id));
}

export async function supprimerPlanReference(id: number): Promise<void> {
  await db.delete(plansReference).where(eq(plansReference.id, id));
}
