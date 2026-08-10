# Authentification simple Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter authentification email/mot de passe multi-utilisateur à ker-plan, avec sessions en DB et toutes les routes protégées sauf `/login` et `/signup`.

**Architecture:** Tables `users`/`sessions` en Drizzle/Neon. Cookie httpOnly `session_id` (token aléatoire) référence une row `sessions`. `src/lib/auth.ts` centralise hash/verify mot de passe, création/lecture/suppression session. Server Actions pour signup/login/logout. Middleware Next.js redirige vers `/login` si cookie absent. Toutes les requêtes `projets` scope par `userId`.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM, Neon Postgres, bcryptjs, Zod, Vitest (nouveau, pour tests unitaires purs).

## Global Constraints

- bcrypt cost factor 12 (spec: Sécurité)
- Cookie session : httpOnly, secure (prod), sameSite=lax, maxAge 30 jours (spec: Login)
- Token session : 32 bytes aléatoires hex via `crypto.randomBytes` (spec: Sécurité)
- Message d'erreur login générique "email ou mot de passe incorrect", ne jamais révéler si l'email existe (spec: Login)
- `projets.userId` NOT NULL, pas de préservation des données existantes — seed reset (spec: Schéma DB / Migration)
- Toutes pages protégées sauf `/login`, `/signup`, assets Next.js (spec: Protection des routes)
- Langue de l'UI : français (cohérent avec le reste de l'app)

---

## File Structure

- `src/db/schema.ts` — ajoute `users`, `sessions`, `projets.userId` (modifie fichier existant)
- `src/lib/auth.ts` — nouveau : hash/verify mot de passe, génération token, createSession/getSession/destroySession
- `src/lib/auth.test.ts` — nouveau : tests unitaires purs (hash/verify, génération token)
- `src/app/actions.ts` — modifie : ajoute signupAction/loginAction/logoutAction, adapte creerProjetAction/supprimerProjetAction pour passer userId
- `src/app/login/page.tsx` — nouveau : formulaire login
- `src/app/signup/page.tsx` — nouveau : formulaire signup
- `src/middleware.ts` — nouveau : protection routes
- `src/lib/projets.ts` — modifie : toutes fonctions scope par userId
- `src/app/page.tsx`, `src/app/projets/[id]/page.tsx`, `src/app/nouveau/page.tsx`, `src/app/parametres/page.tsx` — modifie : appel `getSession()`, passage userId
- `src/db/seed.ts` — modifie : crée user de test, assigne userId aux projets seedés
- `src/app/layout.tsx` — modifie : ajoute lien logout si connecté (léger, pas de nav complexe)
- `package.json` — ajoute bcryptjs, @types/bcryptjs, vitest
- `vitest.config.ts` — nouveau

---

### Task 1: Setup Vitest + dépendances

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: script npm `test` exécutant vitest

- [ ] **Step 1: Installer dépendances**

Run: `pnpm add bcryptjs && pnpm add -D @types/bcryptjs vitest`

- [ ] **Step 2: Créer config vitest**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Ajouter script test dans package.json**

Dans `"scripts"` de `package.json`, ajouter :
```json
"test": "vitest run"
```

- [ ] **Step 4: Vérifier installation**

Run: `pnpm test`
Expected: "No test files found" (aucun test encore écrit) — confirme que vitest tourne sans erreur de config.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "chore: add bcryptjs and vitest for auth work"
```

---

### Task 2: Schéma DB — users, sessions, projets.userId

**Files:**
- Modify: `src/db/schema.ts`

**Interfaces:**
- Produces: `users` table (`id`, `email`, `passwordHash`, `createdAt`), `sessions` table (`id`, `userId`, `expiresAt`, `createdAt`), `projets.userId` (integer, not null, FK)
- Produces: types `User = typeof users.$inferSelect`, `NouvelUser = typeof users.$inferInsert`, `Session = typeof sessions.$inferSelect`

- [ ] **Step 1: Ajouter tables dans schema.ts**

Ajouter en haut de `src/db/schema.ts` (après les imports existants, avant `materiaux`) :

```ts
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

Modifier la table `projets` (ligne `export const projets = pgTable("projets", {`) pour ajouter, juste après `id: serial("id").primaryKey(),` :

```ts
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
```

En bas du fichier, ajouter aux exports de types existants :

```ts
export type User = typeof users.$inferSelect;
export type NouvelUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
```

- [ ] **Step 2: Générer et pousser migration**

Run: `pnpm db:push`
Expected: confirmation Drizzle Kit d'ajout des tables `users`, `sessions` et colonne `projets.user_id`. Répondre "yes" si prompt de perte de données sur `projets` existants (acceptable — spec dit pas de préservation).

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat: add users and sessions tables, projets.userId"
```

---

### Task 3: `src/lib/auth.ts` — hash mot de passe et génération token (unitaires purs)

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/lib/auth.test.ts`

**Interfaces:**
- Produces: `hashMotDePasse(motDePasse: string): Promise<string>`
- Produces: `verifierMotDePasse(motDePasse: string, hash: string): Promise<boolean>`
- Produces: `genererTokenSession(): string`

- [ ] **Step 1: Écrire tests unitaires**

```ts
// src/lib/auth.test.ts
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
```

- [ ] **Step 2: Lancer les tests, vérifier échec**

Run: `pnpm test src/lib/auth.test.ts`
Expected: FAIL — `src/lib/auth.ts` n'existe pas encore.

- [ ] **Step 3: Implémenter les fonctions**

```ts
// src/lib/auth.ts
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
```

- [ ] **Step 4: Lancer les tests, vérifier succès**

Run: `pnpm test src/lib/auth.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/auth.test.ts
git commit -m "feat: add password hashing and session token generation"
```

---

### Task 4: `src/lib/auth.ts` — gestion session (createSession/getSession/destroySession)

**Files:**
- Modify: `src/lib/auth.ts`

**Interfaces:**
- Consumes: `db` de `@/db`, `sessions`/`users` de `@/db/schema`, `genererTokenSession()` de Task 3
- Produces: `DUREE_SESSION_MS = 30 * 24 * 60 * 60 * 1000`
- Produces: `creerSession(userId: number): Promise<{ token: string; expiresAt: Date }>`
- Produces: `obtenirUtilisateurSession(token: string): Promise<{ id: number; email: string } | null>`
- Produces: `supprimerSession(token: string): Promise<void>`
- Produces: `getSession(): Promise<{ user: { id: number; email: string } } | null>` — lit le cookie `session_id` via `next/headers`, wrap `obtenirUtilisateurSession`
- Produces: `poserCookieSession(token: string, expiresAt: Date): Promise<void>` — pose le cookie via `next/headers`
- Produces: `effacerCookieSession(): Promise<void>`

Ces fonctions touchent la DB — pas de test unitaire isolé pertinent ici (pas de DB de test configurée dans ce plan). Vérification par intégration manuelle en Task 6 après que login soit branché bout en bout.

- [ ] **Step 1: Ajouter la gestion de session dans auth.ts**

Ajouter à la fin de `src/lib/auth.ts` :

```ts
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

const DUREE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const NOM_COOKIE = "session_id";

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
```

- [ ] **Step 2: Vérifier compilation**

Run: `pnpm tsc --noEmit`
Expected: aucune erreur liée à `src/lib/auth.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat: add session creation, lookup, and cookie management"
```

---

### Task 5: Server Actions signup/login/logout

**Files:**
- Modify: `src/app/actions.ts`

**Interfaces:**
- Consumes: `hashMotDePasse`, `verifierMotDePasse`, `creerSession`, `poserCookieSession`, `supprimerSession`, `effacerCookieSession`, `getSession` de `@/lib/auth`
- Produces: `signupAction(prevState: { erreur?: string } | undefined, formData: FormData): Promise<{ erreur?: string }>`
- Produces: `loginAction(prevState: { erreur?: string } | undefined, formData: FormData): Promise<{ erreur?: string }>`
- Produces: `logoutAction(): Promise<void>`

- [ ] **Step 1: Ajouter les imports et actions dans actions.ts**

En haut de `src/app/actions.ts`, ajouter aux imports existants :

```ts
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import {
  hashMotDePasse,
  verifierMotDePasse,
  creerSession,
  poserCookieSession,
  supprimerSession,
  effacerCookieSession,
  getSession,
} from "@/lib/auth";
```

Ajouter à la fin du fichier :

```ts
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
```

- [ ] **Step 2: Vérifier compilation**

Run: `pnpm tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 3: Commit**

```bash
git add src/app/actions.ts
git commit -m "feat: add signup, login, logout server actions"
```

---

### Task 6: Pages /login et /signup

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/signup/page.tsx`

**Interfaces:**
- Consumes: `loginAction`, `signupAction` de `@/app/actions` (via `useActionState`)

- [ ] **Step 1: Créer page login**

```tsx
// src/app/login/page.tsx
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Connexion</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <Input name="email" type="email" placeholder="Email" required />
            <Input name="motDePasse" type="password" placeholder="Mot de passe" required />
            {state?.erreur && <p className="text-sm text-destructive">{state.erreur}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Connexion…" : "Se connecter"}
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            Pas de compte ? <Link href="/signup" className="underline">Créer un compte</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Créer page signup**

```tsx
// src/app/signup/page.tsx
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signupAction, undefined);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Créer un compte</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <Input name="email" type="email" placeholder="Email" required />
            <Input name="motDePasse" type="password" placeholder="Mot de passe (8 caractères min.)" required minLength={8} />
            {state?.erreur && <p className="text-sm text-destructive">{state.erreur}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Création…" : "Créer mon compte"}
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            Déjà un compte ? <Link href="/login" className="underline">Se connecter</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Vérifier que `Input` existe dans components/ui, sinon l'ajouter via shadcn**

Run: `ls src/components/ui/input.tsx`
Si absent, run: `pnpm dlx shadcn@latest add input`

- [ ] **Step 4: Vérifier compilation**

Run: `pnpm tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 5: Commit**

```bash
git add src/app/login src/app/signup
git commit -m "feat: add login and signup pages"
```

---

### Task 7: Middleware de protection des routes

**Files:**
- Create: `src/middleware.ts`

**Interfaces:**
- Consumes: rien (lit le cookie brut, pas de call DB dans le middleware — cohérent avec spec "validation DB complète reste dans Server Components/Actions")

- [ ] **Step 1: Créer le middleware**

```ts
// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";

const ROUTES_PUBLIQUES = ["/login", "/signup"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (ROUTES_PUBLIQUES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("session_id")?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Vérifier compilation**

Run: `pnpm tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add middleware protecting all routes except login/signup"
```

---

### Task 8: Scope `projets` par userId

**Files:**
- Modify: `src/lib/projets.ts`
- Modify: `src/app/actions.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/projets/[id]/page.tsx`
- Modify: `src/app/nouveau/page.tsx`

**Interfaces:**
- Consumes: `getSession()` de `@/lib/auth`
- Produces (modifié) : `listerProjets(userId: number): Promise<Projet[]>`
- Produces (modifié) : `obtenirProjet(id: number, userId: number): Promise<Projet | undefined>`
- Produces (modifié) : `creerProjet(input: CreationProjet, userId: number): Promise<Projet>`
- Produces (modifié) : `supprimerProjet(id: number, userId: number): Promise<void>`

- [ ] **Step 1: Modifier src/lib/projets.ts pour scope par userId**

Remplacer le contenu de `src/lib/projets.ts` par :

```ts
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
```

- [ ] **Step 2: Modifier creerProjetAction/supprimerProjetAction dans actions.ts pour exiger session**

Dans `src/app/actions.ts`, remplacer les deux fonctions existantes :

```ts
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
```

- [ ] **Step 3: Modifier src/app/page.tsx pour passer userId**

Dans `src/app/page.tsx`, ajouter l'import `getSession` depuis `@/lib/auth` et `redirect` depuis `next/navigation`, puis modifier `DashboardPage` :

```tsx
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const projets = await listerProjets(session.user.id);
  // ... reste inchangé
```

- [ ] **Step 4: Modifier src/app/projets/[id]/page.tsx**

Ajouter import `getSession` et `redirect`, modifier l'appel :

```tsx
export default async function ProjetPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const projet = await obtenirProjet(Number(id), session.user.id);
  if (!projet || !projet.planGenere) notFound();
  // ... reste inchangé
```

- [ ] **Step 5: Modifier src/app/nouveau/page.tsx pour rediriger si non connecté**

Lire le fichier existant, ajouter en tête du composant serveur (ou wrapper) un check `getSession()` → `redirect("/login")` si absent, suivant le même pattern que Step 3/4. Si la page est déjà un composant serveur async, ajouter directement ; si c'est un client component avec un wrapper serveur, ajouter le check dans le wrapper serveur.

- [ ] **Step 6: Vérifier compilation**

Run: `pnpm tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 7: Commit**

```bash
git add src/lib/projets.ts src/app/actions.ts src/app/page.tsx src/app/projets src/app/nouveau
git commit -m "feat: scope projets by authenticated user"
```

---

### Task 9: Page /parametres protégée + lien logout

**Files:**
- Modify: `src/app/parametres/page.tsx`
- Modify: `src/app/page.tsx` (ajout bouton logout dans le dashboard existant)

**Interfaces:**
- Consumes: `getSession()` de `@/lib/auth`, `logoutAction` de `@/app/actions`

- [ ] **Step 1: Protéger /parametres**

Dans `src/app/parametres/page.tsx`, ajouter en tête du composant serveur :

```tsx
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

// dans le composant :
const session = await getSession();
if (!session) redirect("/login");
```

- [ ] **Step 2: Ajouter bouton logout dans le dashboard**

Dans `src/app/page.tsx`, ajouter un formulaire avec `logoutAction` près du header existant (à l'endroit où se trouve déjà le titre/logo) :

```tsx
import { logoutAction } from "@/app/actions";

// dans le JSX, à côté du header :
<form action={logoutAction}>
  <Button type="submit" variant="ghost" size="sm">Déconnexion</Button>
</form>
```

- [ ] **Step 3: Vérifier compilation**

Run: `pnpm tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 4: Commit**

```bash
git add src/app/parametres src/app/page.tsx
git commit -m "feat: protect parametres page, add logout button"
```

---

### Task 10: Mettre à jour le seed avec un utilisateur de test

**Files:**
- Modify: `src/db/seed.ts`

**Interfaces:**
- Consumes: `hashMotDePasse` de `@/lib/auth`, `users` de `@/db/schema`

- [ ] **Step 1: Ajouter création user de test dans seed.ts**

Ajouter en haut de `src/db/seed.ts` :

```ts
import { users } from "./schema";
import { hashMotDePasse } from "../lib/auth";
```

Ajouter au début de la fonction `seed()` :

```ts
async function seed() {
  const passwordHash = await hashMotDePasse("motdepasse123");
  const [user] = await db
    .insert(users)
    .values({ email: "test@kerplan.sn", passwordHash })
    .onConflictDoNothing()
    .returning();

  console.log(`Utilisateur de test : test@kerplan.sn / motdepasse123 (id=${user?.id ?? "existant"})`);

  // ... reste du seed inchangé (materiaux, mainOeuvre, ratiosConstruction)
```

- [ ] **Step 2: Lancer le seed**

Run: `pnpm db:seed`
Expected: log confirmant création de l'utilisateur de test + catalogues, sans erreur.

- [ ] **Step 3: Commit**

```bash
git add src/db/seed.ts
git commit -m "feat: seed test user for local development"
```

---

### Task 11: Vérification end-to-end manuelle

**Files:** aucun (vérification uniquement)

- [ ] **Step 1: Lancer le serveur dev**

Run: `pnpm dev`

- [ ] **Step 2: Vérifier redirect non-connecté**

Run: `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/`
Expected: `307` (ou 302) avec redirect vers `/login`

- [ ] **Step 3: Vérifier login avec user de test**

Ouvrir `http://localhost:3000/login` dans navigateur, se connecter avec `test@kerplan.sn` / `motdepasse123`.
Expected: redirect vers `/`, dashboard visible avec projets vides (nouveau userId).

- [ ] **Step 4: Vérifier signup + isolation des données**

Créer un second compte via `/signup`, créer un projet.
Expected: projet visible seulement pour ce compte ; se reconnecter avec `test@kerplan.sn` ne montre pas ce projet.

- [ ] **Step 5: Vérifier logout**

Cliquer "Déconnexion" depuis le dashboard.
Expected: redirect vers `/login`, accès direct à `/` redirige de nouveau vers `/login`.

- [ ] **Step 6: Lancer suite de tests unitaires**

Run: `pnpm test`
Expected: PASS (tests de Task 3)

- [ ] **Step 7: Build production**

Run: `pnpm build`
Expected: build réussit sans erreur TypeScript ni erreur de route.

---

## Self-Review Notes

- Couverture spec : signup/login/logout ✓ (Task 5/6), sessions DB ✓ (Task 2/4), cookie httpOnly ✓ (Task 4), middleware ✓ (Task 7), scope userId sur projets ✓ (Task 8), seed ✓ (Task 10), tests unitaires hash/token ✓ (Task 3), vérification E2E manuelle ✓ (Task 11 — pas de Playwright configuré dans ce repo, donc vérification manuelle documentée plutôt que suite automatisée, à noter comme dette si l'app grandit).
- Types cohérents entre tasks : `getSession()` retourne `{ user: { id, email } } | null` partout où utilisé (Task 4, 5, 8, 9).
- Pas de placeholder restant.
