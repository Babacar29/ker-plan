"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { getSession } from "@/lib/auth";
import {
  creerPlanReferenceBrouillon,
  enregistrerExtraction,
  mettreAJourPiece,
  validerPlanReference,
  supprimerPlanReference,
} from "@/lib/banque-plans";
import { extraireDonneesPlan } from "@/lib/extraction-plan";

async function exigerSession() {
  const session = await getSession();
  if (!session) redirect("/login");
}

export async function uploaderPlanAction(formData: FormData): Promise<void> {
  await exigerSession();

  const image = formData.get("image");
  const source = formData.get("source");
  if (!(image instanceof File) || image.size === 0) {
    throw new Error("Aucune image fournie");
  }

  const blob = await put(`plans-reference/${Date.now()}-${image.name}`, image, {
    access: "public",
  });

  const plan = await creerPlanReferenceBrouillon(
    blob.url,
    typeof source === "string" && source.length > 0 ? source : undefined
  );

  try {
    const donnees = await extraireDonneesPlan(blob.url);
    await enregistrerExtraction(plan.id, donnees);
  } catch {
    // La ligne existe déjà avec l'image seule ; l'écran de revue affiche
    // "extraction échouée" et propose de relancer via relancerExtractionAction.
  }

  revalidatePath("/banque-plans");
  redirect(`/banque-plans/${plan.id}`);
}

export async function relancerExtractionAction(id: number, imageUrl: string): Promise<void> {
  await exigerSession();
  const donnees = await extraireDonneesPlan(imageUrl);
  await enregistrerExtraction(id, donnees);
  revalidatePath(`/banque-plans/${id}`);
}

export async function mettreAJourPieceAction(
  id: number,
  champs: { nom?: string; typeExtrait?: string; surfaceM2?: number }
): Promise<void> {
  await exigerSession();
  await mettreAJourPiece(id, champs);
}

export async function validerPlanReferenceAction(id: number): Promise<void> {
  await exigerSession();
  await validerPlanReference(id);
  revalidatePath("/banque-plans");
  revalidatePath(`/banque-plans/${id}`);
}

export async function supprimerPlanReferenceAction(id: number): Promise<void> {
  await exigerSession();
  await supprimerPlanReference(id);
  revalidatePath("/banque-plans");
  redirect("/banque-plans");
}
