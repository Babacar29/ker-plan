# Authentification simple — Design

Date : 2026-08-10

## Contexte

ker-plan (Next.js 16 App Router, Drizzle ORM + Neon Postgres, Server Actions) n'a
aucune authentification. Chaque projet immobilier créé n'est rattaché à personne.
Objectif : ajouter login/signup multi-utilisateur, chaque projet appartenant à son
créateur.

## Portée

- Multi-utilisateur (chaque compte a ses propres projets)
- Authentification par email + mot de passe (credentials), pas d'OAuth
- Session persistée en base (table `sessions`), cookie httpOnly côté client
- Toutes les pages de l'app protégées sauf `/login` et `/signup`
- Pas de préservation des projets existants (base en dev/seed) : `userId` ajouté
  en `NOT NULL` directement, seed reset

Hors périmètre : reset mot de passe par email, vérification email, OAuth,
rate limiting avancé (une protection basique suffit pour ce premier jet).

## Schéma DB (`src/db/schema.ts`)

```ts
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // token aléatoire 32 bytes, hex
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

`projets.userId` ajouté :

```ts
userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
```

## Flux d'authentification

### Signup (`/signup`)
- Formulaire email + mot de passe (+ confirmation)
- Server Action valide (Zod : email valide, mot de passe ≥ 8 caractères)
- Vérifie email pas déjà utilisé → erreur claire sinon
- Hash avec bcryptjs (cost 12), insère `users`
- Crée session, pose cookie, redirect vers accueil

### Login (`/login`)
- Formulaire email + mot de passe
- Server Action : lookup email, compare hash avec bcrypt.compare
- Erreur générique "email ou mot de passe incorrect" (ne pas révéler lequel)
- Crée row `sessions` (token random 32 bytes via `crypto.randomBytes`, expire
  dans 30 jours), pose cookie `session_id` (httpOnly, secure, sameSite=lax,
  maxAge 30 jours)

### Session (`src/lib/auth.ts`)
- `getSession()` : lit cookie `session_id`, lookup en DB, vérifie `expiresAt`
  non dépassé, retourne `{ user }` ou `null`
- Sessions expirées : nettoyées paresseusement (delete au moment du lookup si
  expirée)

### Logout
- Server Action : delete row `sessions` correspondant au cookie, efface cookie

### Protection des routes (`src/middleware.ts`)
- Middleware Next.js vérifie présence + validité basique du cookie (existence
  uniquement — validation DB complète reste dans les Server Components/Actions
  pour éviter requête DB à chaque requête middleware, sauf si perf le permet)
- Routes publiques : `/login`, `/signup`, assets Next.js (`/_next`, favicon)
- Toute autre route : redirect vers `/login` si cookie absent

## Intégration avec le code existant

- `src/lib/projets.ts` : chaque fonction (list, get, create, update, delete)
  reçoit désormais `userId` et filtre/scope les requêtes Drizzle avec
  `eq(projets.userId, userId)`
- `src/app/actions.ts` et toutes Server Actions touchant `projets` appellent
  `getSession()` d'abord, throw si non connecté, passent `session.user.id` aux
  fonctions de `src/lib/projets.ts`
- Pages serveur (`/`, `/projets/[id]`, `/nouveau`, `/parametres`) appellent
  `getSession()`, redirect `/login` si null (défense en profondeur en plus du
  middleware)

## Sécurité

- bcryptjs cost factor 12
- Token session : 32 bytes aléatoires (`crypto.randomBytes(32).toString("hex")`),
  entropie suffisante contre brute-force
- Cookie : httpOnly, secure (prod), sameSite=lax
- Comparaison mot de passe toujours via bcrypt.compare (timing-safe intégré)
- Pas de fuite d'info sur existence d'email au login (message générique)
- Variable d'env `AUTH_COOKIE_SECRET` non nécessaire (pas de JWT signé — le
  token lui-même est le secret, stocké en DB comme clé de session)

## Tests

- Unit : validation Zod signup/login, hash/compare bcrypt
- Intégration : signup crée user + session ; login réussi/échoué ; logout
  supprime session ; accès `projets` scope bien par `userId`
- E2E (Playwright) : signup → redirect accueil connecté ; logout → redirect
  login ; accès `/projets/[id]` sans session → redirect `/login`

## Migration

- `drizzle-kit generate` + `db:push` pour `users`, `sessions`, `projets.userId`
- `src/db/seed.ts` mis à jour : crée un user de test, assigne `userId` aux
  projets seedés
