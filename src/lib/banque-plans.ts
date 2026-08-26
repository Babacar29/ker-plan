import { db } from "@/db";
import { plansReference, plansReferencePieces } from "@/db/schema";
import type { PlanReference, PlanReferencePiece } from "@/db/schema";
import type { ExtractionPlan } from "@/lib/extraction-plan";
import type { TypePiece } from "@/lib/plan-generator";
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

const CORRESPONDANCE_TYPE_EXTRAIT: Record<string, TypePiece> = {
  salon: "salon",
  cuisine: "cuisine",
  chambre: "chambre",
  wc: "wc",
  circulation: "circulation",
  sdb: "sdb",
};

/** Mappe un libellé de type brut extrait d'un plan vers un TypePiece du
 * générateur. Retourne null pour tout libellé sans correspondance connue
 * (ex: "cour", "patio", "garage"). */
export function mapperTypeExtrait(typeExtrait: string): TypePiece | null {
  return CORRESPONDANCE_TYPE_EXTRAIT[typeExtrait.toLowerCase().trim()] ?? null;
}

export type PlanReferenceAvecPieces = { plan: PlanReference; pieces: PlanReferencePiece[] };

function positionComplete(piece: PlanReferencePiece): boolean {
  return piece.xM !== null && piece.yM !== null && piece.largeurM !== null && piece.profondeurM !== null;
}

/** Liste les plans validés, avec leurs pièces, dont toutes les pièces ont
 * une position complète (éligibles au mode copie-exacte) et dont le nombre
 * de chambres est >= nbChambresMin si fourni. */
export async function listerPlansReferenceValides(
  nbChambresMin?: number
): Promise<PlanReferenceAvecPieces[]> {
  const plansValides = await db
    .select()
    .from(plansReference)
    .where(eq(plansReference.statut, "valide"));

  const resultat: PlanReferenceAvecPieces[] = [];
  for (const plan of plansValides) {
    const pieces = await db
      .select()
      .from(plansReferencePieces)
      .where(eq(plansReferencePieces.planReferenceId, plan.id));

    if (pieces.some((p) => !positionComplete(p))) continue;

    const nbChambres = pieces.filter((p) => mapperTypeExtrait(p.typeExtrait) === "chambre").length;
    if (nbChambresMin !== undefined && nbChambres < nbChambresMin) continue;

    resultat.push({ plan, pieces });
  }
  return resultat;
}

/** Calcule, pour chaque TypePiece, le ratio moyen (surface pièce / emprise
 * du plan) sur l'ensemble des plans validés de la banque. Types non mappés
 * ignorés. Mapping vide si aucun plan validé. */
export async function calculerRatiosDepuisBanque(): Promise<Partial<Record<TypePiece, number>>> {
  const plansValides = await db
    .select()
    .from(plansReference)
    .where(eq(plansReference.statut, "valide"));

  const sommes = new Map<TypePiece, { total: number; count: number }>();

  for (const plan of plansValides) {
    const emprise = Number(plan.empriseM2);
    if (!emprise) continue;

    const pieces = await db
      .select()
      .from(plansReferencePieces)
      .where(eq(plansReferencePieces.planReferenceId, plan.id));

    for (const piece of pieces) {
      const type = mapperTypeExtrait(piece.typeExtrait);
      if (!type) continue;
      const ratio = Number(piece.surfaceM2) / emprise;
      const courant = sommes.get(type) ?? { total: 0, count: 0 };
      sommes.set(type, { total: courant.total + ratio, count: courant.count + 1 });
    }
  }

  const resultat: Partial<Record<TypePiece, number>> = {};
  for (const [type, { total, count }] of sommes) {
    resultat[type] = total / count;
  }
  return resultat;
}
