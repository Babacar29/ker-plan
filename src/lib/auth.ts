import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const COUT_BCRYPT = 12;

export async function hashMotDePasse(motDePasse: string): Promise<string> {
  return bcrypt.hash(motDePasse, COUT_BCRYPT);
}

export async function verifierMotDePasse(motDePasse: string, hash: string): Promise<boolean> {
  return bcrypt.compare(motDePasse, hash);
}

export function genererTokenSession(): string {
  return randomBytes(32).toString("hex");
}
