# Banque de plans — pipeline d'ingestion

## Contexte

Le générateur de plan (`src/lib/plan-generator.ts`) utilise aujourd'hui des ratios
de surface codés en dur (calés manuellement sur des plans SNHLM de référence).
L'objectif final est de faire raisonner ce générateur comme un architecte
diplômé, à partir d'une vraie banque de plans réels (captures de plans
d'architectes sénégalais, ex. compte TikTok "Sene Archi").

Ce spec couvre uniquement la **phase 1 : ingestion**. La consommation de cette
banque par `genererPlan` pour ajuster ses ratios/règles (phase 2) fait l'objet
d'un spec séparé, une fois la banque alimentée.

## Portée

Inclus :
- Upload manuel d'image de plan (admin uniquement, protégé comme `/parametres`)
- Extraction automatique (vision LLM) : pièces, surfaces, dimensions de l'emprise
- Écran de revue/correction du brouillon avant validation
- Stockage structuré en base (Postgres/Drizzle)
- Liste + suppression des plans ingérés

Exclus (hors scope) :
- Intégration dans `genererPlan` (phase 2)
- Extension de l'enum `TypePiece` du générateur / rendu 3D
- Système de rôles admin (réutilise la session existante, single-user)
- Pipeline batch/automatisé (scraping, file d'attente) — usage manuel occasionnel uniquement

## Architecture / composants

- `src/app/banque-plans/page.tsx` — page protégée (`getSession()` + redirect
  `/login`, même pattern que `/app/parametres/page.tsx`). Liste des plans
  ingérés + formulaire upload.
- `src/app/banque-plans/[id]/page.tsx` — écran de revue/édition du brouillon
  avant validation.
- `src/app/banque-plans/actions.ts` — server actions (upload, valider
  brouillon, relancer extraction, supprimer), pattern miroir de
  `src/app/actions.ts`.
- `src/lib/banque-plans.ts` — logique métier CRUD, miroir de `src/lib/params.ts`.
- `src/lib/extraction-plan.ts` — appel vision LLM isolé et testable
  (input : URL image, output : objet validé par schéma Zod).

## Modèle de données

Nouvelles tables dans `src/db/schema.ts`, migration via Drizzle Kit
(`npx dotenv -e .env.local -- npx drizzle-kit push`, conforme aux notes
`vercel-storage` déjà en usage dans ce projet).

```ts
export const statutPlanReferenceEnum = pgEnum("statut_plan_reference", [
  "brouillon",
  "valide",
]);

/** Un plan de référence ingéré depuis une image (photo/capture d'écran d'un vrai plan). */
export const plansReference = pgTable("plans_reference", {
  id: serial("id").primaryKey(),
  source: text("source"), // ex: "Sene Archi"
  imageUrl: text("image_url").notNull(),
  empriseM2: numeric("emprise_m2", { precision: 10, scale: 2 }),
  largeurM: numeric("largeur_m", { precision: 10, scale: 2 }),
  profondeurM: numeric("profondeur_m", { precision: 10, scale: 2 }),
  nbNiveaux: integer("nb_niveaux").notNull().default(1),
  statut: statutPlanReferenceEnum("statut").notNull().default("brouillon"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Pièce extraite d'un plan de référence. Type non contraint à TypePiece : le
 * mapping vers les types du générateur se fera en phase 2. */
export const plansReferencePieces = pgTable("plans_reference_pieces", {
  id: serial("id").primaryKey(),
  planReferenceId: integer("plan_reference_id")
    .notNull()
    .references(() => plansReference.id, { onDelete: "cascade" }),
  typeExtrait: text("type_extrait").notNull(), // libellé brut détecté : "chambre", "patio", "cour", "garage", ...
  nom: text("nom").notNull(),
  surfaceM2: numeric("surface_m2", { precision: 10, scale: 2 }).notNull(),
});

export type PlanReference = typeof plansReference.$inferSelect;
export type NouveauPlanReference = typeof plansReference.$inferInsert;
export type PlanReferencePiece = typeof plansReferencePieces.$inferSelect;
```

Le ratio `surfaceM2 / empriseM2` par pièce est recalculé à la lecture, jamais
stocké — même philosophie que le coût des projets (`planGenere` jamais
désynchronisé des prix courants).

## Flux d'ingestion

1. Admin upload une image sur `/banque-plans` → `@vercel/blob` (`put`,
   `access: 'public'`) → `imageUrl`.
2. Server action crée une ligne `plansReference` (`statut: "brouillon"`,
   `imageUrl` seul, autres champs `null`).
3. `extraireDonneesPlan(imageUrl)` appelle `generateObject` (package `ai`,
   modèle vision via AI Gateway — liste de modèles disponibles à vérifier au
   moment de l'implémentation via
   `curl -s https://ai-gateway.vercel.sh/v1/models | jq ...`, prendre le
   modèle vision le plus récent de la famille Claude) avec un schéma Zod :
   `{ empriseM2, largeurM, profondeurM, nbNiveaux, pieces: [{ nom, typeExtrait, surfaceM2 }] }`.
   Prompt calé sur les conventions observées sur les plans réels : m² en
   encadré bleu, cotes en cm le long des bords, libellés FR abrégés
   ("SDB", "CH1", "cour de service", "espace familial").
4. Résultat validé → `plansReference` mis à jour (empriseM2, dimensions,
   nbNiveaux) + insertion des `plansReferencePieces`. Reste `statut: "brouillon"`.
5. Admin ouvre `/banque-plans/[id]` : tableau éditable (nom / type extrait /
   surface m²) pré-rempli, corrige si besoin, clique "Valider" →
   `statut: "valide"`.
6. `/banque-plans` liste tous les plans (miniature, empriseM2, nb pièces,
   statut), avec action supprimer.

## Gestion des erreurs

- Échec upload (réseau, taille, format) → message inline, aucune ligne DB
  créée.
- Échec extraction (timeout, JSON invalide rejeté par Zod) → la ligne
  `plansReference` existe déjà (`imageUrl` seul, pas de pièces) ; l'écran de
  revue affiche "extraction échouée" + bouton "réessayer" qui relance
  `extraireDonneesPlan` sans re-upload.
- Suppression d'un `plansReference` → cascade sur `plansReferencePieces`
  (`onDelete: "cascade"`).
- Un plan `"brouillon"` jamais validé n'est jamais lu par la phase 2 (filtre
  `statut = "valide"` obligatoire côté requêtes futures) — évite qu'une
  extraction non relue pollue le futur moteur de ratios.

## Tests

- Unit `extraction-plan.test.ts` : mock de la réponse `generateObject` →
  validation du schéma Zod, mapping vers les types internes, cas JSON
  incomplet/rejeté.
- Unit `banque-plans.test.ts` : calcul du ratio pièce (surfaceM2/empriseM2),
  transition de statut brouillon → validé.
- Pas de E2E Playwright pour l'upload d'image réel (coût, flakiness d'un
  appel vision réel) — vérification manuelle de `/banque-plans` en dev en fin
  d'implémentation.

## Prochaine étape

Une fois quelques plans validés dans la banque, ouvrir un nouveau spec pour
la phase 2 : `genererPlan` interroge `plansReference`/`plansReferencePieces`
(statut "valide") pour dériver ses ratios de surface par type de pièce
(pondérés par similarité nbChambres/surface totale) au lieu des constantes
`RATIO_*` actuelles, et éventuellement des règles d'adjacence entre types de
pièces.
