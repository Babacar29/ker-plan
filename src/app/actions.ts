"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { creerProjet, supprimerProjet, type CreationProjet } from "@/lib/projets";
import { mettreAJourPrixMateriau, mettreAJourForfaitMainOeuvre, mettreAJourRatio } from "@/lib/params";
import {
  hashMotDePasse,
  verifierMotDePasse,
  creerSession,
  poserCookieSession,
  supprimerSession,
  effacerCookieSession,
  getSession,
} from "@/lib/auth";

export async function creerProjetAction(input: CreationProjet) {
  const session = await getSession();
  if (!session) redirect("/login");

  const projet = await creerProjet(input, session.user.id);
  revalidatePath("/");
  redirect(`/projets/${projet.id}`);
}

export async function supprimerProjetAction(id: number) {
  const session = await getSession();
  if (!session) redirect("/login");

  await supprimerProjet(id, session.user.id);
  revalidatePath("/");
}

export async function mettreAJourPrixMateriauAction(id: number, prixUnitaireFcfa: number) {
  const session = await getSession();
  if (!session) redirect("/login");

  await mettreAJourPrixMateriau(id, prixUnitaireFcfa);
  revalidatePath("/parametres");
  revalidatePath("/projets", "layout");
}

export async function mettreAJourForfaitMainOeuvreAction(id: number, forfaitFcfaM2: number) {
  const session = await getSession();
  if (!session) redirect("/login");

  await mettreAJourForfaitMainOeuvre(id, forfaitFcfaM2);
  revalidatePath("/parametres");
  revalidatePath("/projets", "layout");
}

export async function mettreAJourRatioAction(id: number, valeur: number) {
  const session = await getSession();
  if (!session) redirect("/login");

  await mettreAJourRatio(id, valeur);
  revalidatePath("/parametres");
  revalidatePath("/projets", "layout");
}

const SchemaSignup = z.object({
  email: z.string().email("Email invalide"),
  motDePasse: z.string().min(8, "Mot de passe : 8 caractères minimum"),
});

export async function signupAction(
  _prevState: { erreur?: string } | undefined,
  formData: FormData
): Promise<{ erreur?: string }> {
  const parsed = SchemaSignup.safeParse({
    email: formData.get("email"),
    motDePasse: formData.get("motDePasse"),
  });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const [existant] = await db.select().from(users).where(eq(users.email, parsed.data.email));
  if (existant) {
    return { erreur: "Cet email est déjà utilisé" };
  }

  const passwordHash = await hashMotDePasse(parsed.data.motDePasse);
  const [user] = await db.insert(users).values({ email: parsed.data.email, passwordHash }).returning();

  const { token, expiresAt } = await creerSession(user.id);
  await poserCookieSession(token, expiresAt);

  redirect("/");
}

const SchemaLogin = z.object({
  email: z.string().email("Email invalide"),
  motDePasse: z.string().min(1, "Mot de passe requis"),
});

export async function loginAction(
  _prevState: { erreur?: string } | undefined,
  formData: FormData
): Promise<{ erreur?: string }> {
  const parsed = SchemaLogin.safeParse({
    email: formData.get("email"),
    motDePasse: formData.get("motDePasse"),
  });
  if (!parsed.success) {
    return { erreur: "Email ou mot de passe incorrect" };
  }

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email));
  if (!user || !(await verifierMotDePasse(parsed.data.motDePasse, user.passwordHash))) {
    return { erreur: "Email ou mot de passe incorrect" };
  }

  const { token, expiresAt } = await creerSession(user.id);
  await poserCookieSession(token, expiresAt);

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get("session_id")?.value;
  if (token) await supprimerSession(token);
  await effacerCookieSession();
  redirect("/login");
}
