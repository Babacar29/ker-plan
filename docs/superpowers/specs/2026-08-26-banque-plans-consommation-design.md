# Banque de plans — consommation par le générateur (phase 2)

## Contexte

Phase 1 (ingestion, [2026-08-25-banque-plans-ingestion-design.md](./2026-08-25-banque-plans-ingestion-design.md))
a livré la banque de plans validés (`plansReference` / `plansReferencePieces`).
`genererPlan` (`src/lib/plan-generator.ts`) utilise toujours des ratios de
surface codés en dur (`RATIO_SALON`, `RATIO_CUISINE`, etc.). Cette phase
branche la banque sur le générateur, avec deux modes distincts.

## Portée

Inclus :
- **Mode ratio** (défaut, aucun plan choisi) : ratios de surface par type de
  pièce calculés dynamiquement depuis la moyenne des plans validés, au lieu
  des constantes `RATIO_*`. Fallback sur les constantes actuelles si aucun
  plan validé (comportement inchangé sur install fraîche).
- **Mode copie-exacte** (plan référence choisi par l'utilisateur) : le plan
  3D reproduit l'agencement du plan référence choisi, mis à l'échelle sur la
  surface du terrain du projet, proportions/agencement relatif conservés.
- Extension de l'extraction (phase 1) pour capturer la position/dimension de
  chaque pièce (nécessaire au mode copie-exacte).
- Sélecteur de plan référence dans le formulaire de création de projet
  (galerie avec miniatures, filtrée sur compatibilité nbChambres).

Exclus (hors scope) :
- Règles d'adjacence entre types de pièces (pondération au-delà de la
  simple moyenne de ratios).
- Extraction des portes/fenêtres depuis l'image — réutilise la génération
  géométrique existante (`genererPortes`/`genererFenetres`) sur le layout
  copié.
- Système de recommandation ("plans similaires suggérés") — l'utilisateur
  choisit lui-même dans la galerie.
- Ré-extraction automatique des plans déjà validés en phase 1 (sans
  position) — passage manuel par "Réessayer" par plan concerné.

## Modèle de données

### `plansReferencePieces` — colonnes ajoutées (nullable, rétrocompatible)

```ts
export const plansReferencePieces = pgTable("plans_reference_pieces", {
  // ... colonnes existantes (id, planReferenceId, typeExtrait, nom, surfaceM2)
  niveauIndex: integer("niveau_index").notNull().default(0),
  xM: numeric("x_m", { precision: 10, scale: 2 }),
  yM: numeric("y_m", { precision: 10, scale: 2 }),
  largeurM: numeric("largeur_m", { precision: 10, scale: 2 }),
  profondeurM: numeric("profondeur_m", { precision: 10, scale: 2 }),
});
```

`niveauIndex` : absent en phase 1 (tous les plans étaient traités comme un
seul niveau implicite) — ajouté ici pour permettre le regroupement par
niveau en mode copie-exacte, `default(0)` rétrocompatible avec les lignes
existantes.

`xM`/`yM`/`largeurM`/`profondeurM` nullable : les lignes issues de la phase 1
(avant cette migration) n'ont pas ces valeurs tant que le plan n'est pas
ré-extrait. Un plan sans position complète sur toutes ses pièces est
inéligible au mode copie-exacte (voir Gestion des erreurs) mais reste
utilisable pour le mode ratio (qui n'a besoin que de `surfaceM2`).

### `projets` — colonne ajoutée

```ts
export const projets = pgTable("projets", {
  // ... colonnes existantes
  planReferenceId: integer("plan_reference_id")
    .references(() => plansReference.id, { onDelete: "set null" }),
});
```

`onDelete: "set null"` : un projet garde son plan déjà généré même si la
référence source est supprimée après coup de la banque.

## Architecture / composants

- `src/lib/extraction-plan.ts` — schéma Zod étendu (position/dimension +
  niveau par pièce), prompt Gemini étendu.
- `src/lib/banque-plans.ts` — nouvelles fonctions :
  - `calculerRatiosDepuisBanque(): Promise<Partial<Record<TypePiece, number>>>`
  - `listerPlansReferenceValides(nbChambresMin?: number): Promise<PlanReferenceAvecPieces[]>`
  - `mapperTypeExtrait(typeExtrait: string): TypePiece` (table de
    correspondance partagée par les deux modes)
- `src/lib/plan-generator.ts` :
  - `genererPlan(...)` — signature existante conservée, `ratios` en paramètre
    optionnel remplace les constantes `RATIO_*` en dur quand fourni.
  - `genererPlanDepuisReference(planReferenceId, surfaceEmpriseM2Cible, nbNiveauxCible): Promise<Plan>`
    — nouvelle fonction, mode copie-exacte.
- `src/app/actions.ts` (`creerProjetAction`/`modifierProjetAction`) —
  dispatch : `planReferenceId` fourni → `genererPlanDepuisReference`, sinon
  → `calculerRatiosDepuisBanque` + `genererPlan`.
- `src/components/nouveau-projet-form.tsx` — galerie de sélection de plan
  référence (nouvelle section).

## Mode ratio — calcul

`calculerRatiosDepuisBanque()` :
1. Charge tous les `plansReference` statut `"valide"` + leurs
   `plansReferencePieces`.
2. Pour chaque pièce, `typeExtrait` → `TypePiece` via `mapperTypeExtrait`
   (types non reconnus ignorés).
3. Groupe par `TypePiece`, moyenne de `surfaceM2 / plan.empriseM2` sur
   toutes les occurrences.
4. Retourne le mapping obtenu ; toute clé absente (aucune occurrence dans la
   banque) est comblée par la constante `RATIO_*` correspondante côté
   `genererPlan`.

Aucun plan validé en banque → mapping vide → comportement identique à avant
cette phase (fallback intégral sur `RATIO_*`).

## Mode copie-exacte — algorithme

`genererPlanDepuisReference(planReferenceId, surfaceEmpriseM2Cible, nbNiveauxCible)` :

1. Charge le plan référence + ses pièces (doivent toutes avoir
   `xM`/`yM`/`largeurM`/`profondeurM` non nuls — sinon erreur, voir Gestion
   des erreurs).
2. Groupe les pièces par `niveauIndex`.
3. Facteur d'échelle `k = sqrt(surfaceEmpriseM2Cible / plan.empriseM2)`.
   Applique `k` à `xM`, `yM`, `largeurM`, `profondeurM` de chaque pièce.
4. Ajustement du nombre de niveaux :
   - `nbNiveauxCible <= nbNiveauxRéférence` → garde les `nbNiveauxCible`
     premiers niveaux (RDC prioritaire, `niveauIndex` 0 en premier).
   - `nbNiveauxCible > nbNiveauxRéférence` → duplique le dernier niveau de
     référence jusqu'à atteindre `nbNiveauxCible`, en renumérotant l'index de
     niveau du `Plan` produit.
5. Pour chaque niveau, dérive `pieces: Piece[]` (rects mis à l'échelle, type
   via `mapperTypeExtrait`), puis appelle `genererPortes(pieces)` et
   `genererFenetres(pieces, largeurM, profondeurM)` (fonctions existantes,
   inchangées) pour produire les ouvertures.
6. Retourne `Plan` au même format que `genererPlan` — aucun changement côté
   consommateurs (`scene-3d.tsx`, page projet).

## Sélecteur de plan référence (UI)

`nouveau-projet-form.tsx` :
- Nouvelle section "Plan de référence (optionnel)" entre les champs
  chambres/niveaux et le reste du formulaire.
- Grid de cards cliquables : miniature (`imageUrl`), empriseM2, nb de
  pièces `type="chambre"`. Card "Aucun — génération automatique" présente en
  premier, sélectionnée par défaut.
- Liste chargée via `listerPlansReferenceValides(nbChambres)` — filtre les
  plans dont le nombre de pièces `typeExtrait` mappées sur `chambre` est
  `>= nbChambres` saisi, et dont toutes les pièces ont une position complète
  (éligibilité copie-exacte). Filtrage client sur la liste complète chargée
  côté page serveur (banque restant de taille modeste) ; re-filtre côté
  client quand `nbChambres` change dans le formulaire.
- Sélection stockée dans l'état du formulaire (`planReferenceId: number | null`),
  transmise à `creerProjetAction`/`modifierProjetAction` dans l'input.

## Gestion des erreurs

- `genererPlanDepuisReference` appelé sur un plan dont une pièce n'a pas de
  position (`xM`/`yM`/`largeurM`/`profondeurM` null — plan issu de la phase 1
  jamais ré-extrait) → erreur explicite propagée jusqu'à l'action, message
  "Ce plan n'a pas encore de positions extraites, réessaie l'extraction
  depuis /banque-plans avant de le choisir". Le sélecteur UI filtre déjà ces
  plans hors de la galerie (`listerPlansReferenceValides` n'inclut que les
  plans avec position complète sur toutes leurs pièces) — cette erreur ne
  devrait survenir qu'en cas de course (plan invalidé entre chargement de la
  galerie et soumission).
- Modification d'un projet existant (`modifierProjetAction`) avec un
  `planReferenceId` différent → régénère le plan depuis la nouvelle
  référence (même dispatch qu'à la création).
- `plansReference` supprimé après avoir été référencé par un projet →
  `projets.planReferenceId` passe à `null` (cascade DB), le plan déjà généré
  et stocké (`projets.planGenere`) reste inchangé — pas de régénération
  automatique.

## Tests

- Unit `banque-plans.test.ts` : `calculerRatiosDepuisBanque` (banque vide →
  mapping vide ; plans avec types variés → moyenne correcte ; type non
  mappé → ignoré), `mapperTypeExtrait` (cas connus + fallback), filtrage de
  `listerPlansReferenceValides` (nbChambresMin, exclusion plans sans
  position).
- Unit `plan-generator.test.ts` (nouveau fichier) : `genererPlanDepuisReference`
  — mise à l'échelle correcte (surface cible différente), troncature de
  niveaux, duplication de niveaux, erreur sur pièce sans position.
- Pas de nouveau test E2E Playwright — vérification manuelle en dev
  (sélection d'un plan référence + comparaison visuelle 3D avec l'image
  source) en fin d'implémentation, même approche que la phase 1.

## Prochaine étape

Aucune — ce spec clôt le scope initial "banque de plans" (ingestion +
consommation). Évolutions futures (règles d'adjacence, recommandation de
plans similaires) à rouvrir en spec séparé si besoin identifié après usage
réel.
