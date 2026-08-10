import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

const COUT_BCRYPT = 12;
const DUREE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const NOM_COOKIE = "session_id";

export async function hashMotDePasse(motDePasse: string): Promise<string> {
  return bcrypt.hash(motDePasse, COUT_BCRYPT);
}

export async function verifierMotDePasse(motDePasse: string, hash: string): Promise<boolean> {
  return bcrypt.compare(motDePasse, hash);
}

export function genererTokenSession(): string {
  return randomBytes(32).toString("hex");
}

export async function creerSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = genererTokenSession();
  const expiresAt = new Date(Date.now() + DUREE_SESSION_MS);

  await db.insert(sessions).values({ id: token, userId, expiresAt });

  return { token, expiresAt };
}

export async function obtenirUtilisateurSession(
  token: string
): Promise<{ id: number; email: string } | null> {
  const [row] = await db
    .select({ userId: sessions.userId, expiresAt: sessions.expiresAt, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, token));

  if (!row) return null;

  if (row.expiresAt.getTime() < Date.now()) {
    await supprimerSession(token);
    return null;
  }

  return { id: row.userId, email: row.email };
}

export async function supprimerSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, token));
}

export async function poserCookieSession(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(NOM_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function effacerCookieSession(): Promise<void> {
  const store = await cookies();
  store.delete(NOM_COOKIE);
}

export async function getSession(): Promise<{ user: { id: number; email: string } } | null> {
  const store = await cookies();
  const token = store.get(NOM_COOKIE)?.value;
  if (!token) return null;

  const user = await obtenirUtilisateurSession(token);
  if (!user) return null;

  return { user };
}
