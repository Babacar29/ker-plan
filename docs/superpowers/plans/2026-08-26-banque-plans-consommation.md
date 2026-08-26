# Banque de plans — consommation par le générateur (phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Branch the validated reference-plan bank onto `genererPlan` so projects either derive their room-surface ratios from validated plans (default) or exactly reproduce a chosen reference plan's layout, scaled to the project's footprint.

**Architecture:** Extend the extraction schema and `plansReferencePieces` table with per-room position/dimension/level data. Add pure computation functions (`calculerRatiosDepuisBanque`, `mapperTypeExtrait`, `genererPlanDepuisReference`) that read the bank and feed either `genererPlan`'s existing layout engine (ratio mode) or a new scale-and-reuse path (exact-copy mode). Wire a `planReferenceId` column on `projets` and a gallery selector into the existing project form.

**Tech Stack:** Next.js App Router, Drizzle ORM/Postgres, Zod, Vitest, `@ai-sdk/google` (Gemini vision), React (client component).

**Spec:** [docs/superpowers/specs/2026-08-26-banque-plans-consommation-design.md](../specs/2026-08-26-banque-plans-consommation-design.md)

## Global Constraints

- New DB columns are nullable (`xM`, `yM`, `largeurM`, `profondeurM`) or have safe defaults (`niveauIndex` default `0`, `projets.planReferenceId` nullable) — no backfill migration, phase 1 data stays valid.
- `projets.planReferenceId` uses `onDelete: "set null"`.
- `genererPlan`'s existing signature and return shape (`Plan`) must not change for existing callers — new behavior is additive via an optional parameter.
- All new DB-facing functions live in `src/lib/banque-plans.ts`; all new layout/geometry logic lives in `src/lib/plan-generator.ts` — matches existing file responsibilities.
- Migration command: `npx dotenv -e .env.local -- npx drizzle-kit push` (per existing project convention).
- French naming throughout (`ratioCirculation`, `nbNiveaux`, etc.) — match existing codebase language.

---

## Task 1: Extend database schema

**Files:**
- Modify: `src/db/schema.ts`

**Interfaces:**
- Produces: `plansReferencePieces.niveauIndex: integer`, `plansReferencePieces.xM/yM/largeurM/profondeurM: numeric | null`, `projets.planReferenceId: integer | null`. Read by Task 3 (storage), Task 4/5 (ratio/gallery queries), Task 7 (exact-copy), Task 9 (project creation).

- [ ] **Step 1: Add new columns to `plansReferencePieces`**

In `src/db/schema.ts`, modify the `plansReferencePieces` table definition:

```ts
export const plansReferencePieces = pgTable("plans_reference_pieces", {
  id: serial("id").primaryKey(),
  planReferenceId: integer("plan_reference_id")
    .notNull()
    .references(() => plansReference.id, { onDelete: "cascade" }),
  typeExtrait: text("type_extrait").notNull(),
  nom: text("nom").notNull(),
  surfaceM2: numeric("surface_m2", { precision: 10, scale: 2 }).notNull(),
  niveauIndex: integer("niveau_index").notNull().default(0),
  xM: numeric("x_m", { precision: 10, scale: 2 }),
  yM: numeric("y_m", { precision: 10, scale: 2 }),
  largeurM: numeric("largeur_m", { precision: 10, scale: 2 }),
  profondeurM: numeric("profondeur_m", { precision: 10, scale: 2 }),
});
```

- [ ] **Step 2: Add `planReferenceId` column to `projets`**

In `src/db/schema.ts`, modify the `projets` table definition — add right after `modeBriques`:

```ts
  modeBriques: modeBriquesEnum("mode_briques").notNull().default("usine"),
  planReferenceId: integer("plan_reference_id")
    .references(() => plansReference.id, { onDelete: "set null" }),
```

Arrow-function reference defers evaluation, so declaration order (`projets` before `plansReference`) is fine — same pattern already used for `sessions.userId` → `users`.

- [ ] **Step 3: Push migration**

Run: `npx dotenv -e .env.local -- npx drizzle-kit push`
Expected: prompts to add 6 nullable/defaulted columns, no data loss warning. Accept.

- [ ] **Step 4: Verify existing tests still pass**

Run: `pnpm test`
Expected: PASS (24/24, unchanged)

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat: add position/level columns to plans_reference_pieces and plan_reference_id to projets"
```

---

## Task 2: Extend extraction schema and prompt

**Files:**
- Modify: `src/lib/extraction-plan.ts`
- Test: `src/lib/extraction-plan.test.ts`

**Interfaces:**
- Produces: `SchemaExtractionPlan` pieces now include `niveauIndex: number`, `xM: number`, `yM: number`, `largeurM: number`, `profondeurM: number`. `ExtractionPlan` type (inferred) consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/extraction-plan.test.ts`:

```ts
import { SchemaExtractionPlan } from "./extraction-plan";

describe("SchemaExtractionPlan (phase 2 : position)", () => {
  it("accepte une pièce avec niveau et position complète", () => {
    const donnees = {
      empriseM2: 100,
      largeurM: 10,
      profondeurM: 10,
      nbNiveaux: 1,
      pieces: [
        {
          nom: "Salon",
          typeExtrait: "salon",
          surfaceM2: 20,
          niveauIndex: 0,
          xM: 0,
          yM: 0,
          largeurM: 5,
          profondeurM: 4,
        },
      ],
    };
    const parsed = SchemaExtractionPlan.parse(donnees);
    expect(parsed.pieces[0].niveauIndex).toBe(0);
    expect(parsed.pieces[0].xM).toBe(0);
    expect(parsed.pieces[0].largeurM).toBe(5);
  });

  it("rejette une pièce sans position (champs désormais requis)", () => {
    const donnees = {
      empriseM2: 100,
      largeurM: 10,
      profondeurM: 10,
      nbNiveaux: 1,
      pieces: [{ nom: "Salon", typeExtrait: "salon", surfaceM2: 20 }],
    };
    expect(() => SchemaExtractionPlan.parse(donnees)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/extraction-plan.test.ts`
Expected: FAIL — position fields stripped as unknown keys, and second test doesn't throw yet.

- [ ] **Step 3: Extend the Zod schema and prompt**

In `src/lib/extraction-plan.ts`, replace the `pieces` field:

```ts
export const SchemaExtractionPlan = z.object({
  empriseM2: z.number().positive(),
  largeurM: z.number().positive(),
  profondeurM: z.number().positive(),
  nbNiveaux: z.number().int().positive(),
  pieces: z.array(
    z.object({
      nom: z.string().min(1),
      typeExtrait: z.string().min(1),
      surfaceM2: z.number().positive(),
      niveauIndex: z.number().int().min(0),
      xM: z.number().min(0),
      yM: z.number().min(0),
      largeurM: z.number().positive(),
      profondeurM: z.number().positive(),
    })
  ),
});
```

Replace `PROMPT_EXTRACTION`'s pieces bullet:

```ts
const PROMPT_EXTRACTION = `Tu es un architecte qui lit un plan de maison réel (capture d'écran ou photo).
Extrais les informations suivantes en respectant les conventions observées sur ce type de plan :
- la surface totale de l'emprise au sol en m² (souvent affichée dans un encadré bleu)
- la largeur et la profondeur de l'emprise en mètres (déduites des cotes en cm le long des bords, converties en mètres)
- le nombre de niveaux (RDC seul = 1, RDC + étage = 2, etc.)
- la liste des pièces avec : leur nom tel qu'affiché (ex: "SDB", "CH1", "cour de service", "espace familial") ; un type extrait normalisé en minuscules (ex: "chambre", "salon", "cuisine", "sdb", "wc", "circulation", "cour", "patio", "garage", ou un autre libellé court si aucun type standard ne correspond) ; leur surface en m² ; l'index du niveau où elles se trouvent (0 = RDC, 1 = premier étage, etc.) ; leur position (x, y) en mètres du coin haut-gauche de la pièce par rapport au coin haut-gauche de l'emprise du niveau (x vers la droite, y vers le bas) ; leur largeur et profondeur en mètres.
Si une valeur n'est pas lisible sur le plan, fais la meilleure estimation possible à partir des cotes visibles plutôt que de l'omettre. Les positions et dimensions de toutes les pièces d'un même niveau doivent former un pavage cohérent de l'emprise de ce niveau, sans chevauchement.`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/extraction-plan.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/extraction-plan.ts src/lib/extraction-plan.test.ts
git commit -m "feat: extract room position, dimension, and level from reference plan images"
```

---

## Task 3: Store position/level fields on extraction

**Files:**
- Modify: `src/lib/banque-plans.ts`
- Test: `src/lib/banque-plans.test.ts`

**Interfaces:**
- Consumes: `ExtractionPlan` from Task 2 (position fields per piece).
- Produces: `enregistrerExtraction` persists position/level fields. `PlanReferencePiece` type (schema, Task 1) reflects new columns — consumed by Task 4, 5, 7.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/banque-plans.test.ts`:

```ts
import { enregistrerExtraction, obtenirPlanReference, creerPlanReferenceBrouillon } from "./banque-plans";

describe("enregistrerExtraction (phase 2 : position)", () => {
  it("persiste niveauIndex et position par pièce", async () => {
    const plan = await creerPlanReferenceBrouillon("https://example.com/plan.png");
    await enregistrerExtraction(plan.id, {
      empriseM2: 100,
      largeurM: 10,
      profondeurM: 10,
      nbNiveaux: 1,
      pieces: [
        {
          nom: "Salon",
          typeExtrait: "salon",
          surfaceM2: 20,
          niveauIndex: 0,
          xM: 0,
          yM: 0,
          largeurM: 5,
          profondeurM: 4,
        },
      ],
    });
    const resultat = await obtenirPlanReference(plan.id);
    expect(resultat?.pieces[0].niveauIndex).toBe(0);
    expect(Number(resultat?.pieces[0].xM)).toBe(0);
    expect(Number(resultat?.pieces[0].largeurM)).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/banque-plans.test.ts`
Expected: FAIL — `niveauIndex`/`xM`/`largeurM` come back `undefined`/`null`.

- [ ] **Step 3: Update `enregistrerExtraction`**

In `src/lib/banque-plans.ts`, replace the `pieces` insert block:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/banque-plans.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/banque-plans.ts src/lib/banque-plans.test.ts
git commit -m "feat: persist room position, dimension, and level on extraction"
```

---

## Task 4: `mapperTypeExtrait` and `calculerRatiosDepuisBanque`

**Files:**
- Modify: `src/lib/banque-plans.ts`
- Test: `src/lib/banque-plans.test.ts`

**Interfaces:**
- Consumes: `TypePiece` from `src/lib/plan-generator.ts` (`"salon" | "cuisine" | "chambre" | "wc" | "circulation" | "sdb"`).
- Produces: `mapperTypeExtrait(typeExtrait: string): TypePiece | null`, `calculerRatiosDepuisBanque(): Promise<Partial<Record<TypePiece, number>>>`. Consumed by Task 6 and Task 9.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/banque-plans.test.ts`:

```ts
import { mapperTypeExtrait, calculerRatiosDepuisBanque } from "./banque-plans";

describe("mapperTypeExtrait", () => {
  it("mappe les libellés connus vers TypePiece", () => {
    expect(mapperTypeExtrait("chambre")).toBe("chambre");
    expect(mapperTypeExtrait("salon")).toBe("salon");
    expect(mapperTypeExtrait("cuisine")).toBe("cuisine");
    expect(mapperTypeExtrait("sdb")).toBe("sdb");
    expect(mapperTypeExtrait("wc")).toBe("wc");
    expect(mapperTypeExtrait("circulation")).toBe("circulation");
  });

  it("est insensible à la casse", () => {
    expect(mapperTypeExtrait("Chambre")).toBe("chambre");
  });

  it("retourne null pour un libellé non reconnu", () => {
    expect(mapperTypeExtrait("cour")).toBeNull();
    expect(mapperTypeExtrait("garage")).toBeNull();
  });
});

describe("calculerRatiosDepuisBanque", () => {
  it("retourne un mapping vide si aucun plan validé", async () => {
    const ratios = await calculerRatiosDepuisBanque();
    expect(ratios).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/banque-plans.test.ts`
Expected: FAIL — functions not exported yet.

- [ ] **Step 3: Implement**

In `src/lib/banque-plans.ts`, extend imports and add functions:

```ts
import type { TypePiece } from "@/lib/plan-generator";

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/banque-plans.test.ts`
Expected: PASS

- [ ] **Step 5: Add and run a multi-plan average test**

Add to `src/lib/banque-plans.test.ts`:

```ts
  it("calcule la moyenne des ratios sur plusieurs plans validés", async () => {
    const plan1 = await creerPlanReferenceBrouillon("https://example.com/p1.png");
    await enregistrerExtraction(plan1.id, {
      empriseM2: 100,
      largeurM: 10,
      profondeurM: 10,
      nbNiveaux: 1,
      pieces: [
        { nom: "Salon", typeExtrait: "salon", surfaceM2: 20, niveauIndex: 0, xM: 0, yM: 0, largeurM: 5, profondeurM: 4 },
      ],
    });
    await validerPlanReference(plan1.id);

    const plan2 = await creerPlanReferenceBrouillon("https://example.com/p2.png");
    await enregistrerExtraction(plan2.id, {
      empriseM2: 200,
      largeurM: 14,
      profondeurM: 14,
      nbNiveaux: 1,
      pieces: [
        { nom: "Salon", typeExtrait: "salon", surfaceM2: 60, niveauIndex: 0, xM: 0, yM: 0, largeurM: 8, profondeurM: 7 },
      ],
    });
    await validerPlanReference(plan2.id);

    const ratios = await calculerRatiosDepuisBanque();
    // (0.20 + 0.30) / 2 = 0.25
    expect(ratios.salon).toBeCloseTo(0.25, 5);
  });
```

Add `import { validerPlanReference } from "./banque-plans";` if not already present (should already be imported by earlier tests).

Run: `pnpm vitest run src/lib/banque-plans.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/banque-plans.ts src/lib/banque-plans.test.ts
git commit -m "feat: derive room-surface ratios from the validated plan bank"
```

---

## Task 5: `listerPlansReferenceValides`

**Files:**
- Modify: `src/lib/banque-plans.ts`
- Test: `src/lib/banque-plans.test.ts`

**Interfaces:**
- Consumes: `mapperTypeExtrait` from Task 4.
- Produces: `PlanReferenceAvecPieces` type, `listerPlansReferenceValides(nbChambresMin?: number): Promise<PlanReferenceAvecPieces[]>`. Consumed by Task 9's server pages and UI.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/banque-plans.test.ts`:

```ts
import { listerPlansReferenceValides } from "./banque-plans";

describe("listerPlansReferenceValides", () => {
  it("exclut les plans brouillon", async () => {
    const plan = await creerPlanReferenceBrouillon("https://example.com/brouillon.png");
    await enregistrerExtraction(plan.id, {
      empriseM2: 100, largeurM: 10, profondeurM: 10, nbNiveaux: 1,
      pieces: [{ nom: "Chambre 1", typeExtrait: "chambre", surfaceM2: 12, niveauIndex: 0, xM: 0, yM: 0, largeurM: 3, profondeurM: 4 }],
    });
    const resultat = await listerPlansReferenceValides();
    expect(resultat.find((p) => p.plan.id === plan.id)).toBeUndefined();
  });

  it("inclut un plan validé avec position complète", async () => {
    const plan = await creerPlanReferenceBrouillon("https://example.com/complet.png");
    await enregistrerExtraction(plan.id, {
      empriseM2: 100, largeurM: 10, profondeurM: 10, nbNiveaux: 1,
      pieces: [{ nom: "Chambre 1", typeExtrait: "chambre", surfaceM2: 12, niveauIndex: 0, xM: 0, yM: 0, largeurM: 3, profondeurM: 4 }],
    });
    await validerPlanReference(plan.id);
    const resultat = await listerPlansReferenceValides();
    expect(resultat.find((p) => p.plan.id === plan.id)).toBeDefined();
  });

  it("filtre par nbChambresMin", async () => {
    const plan = await creerPlanReferenceBrouillon("https://example.com/2ch.png");
    await enregistrerExtraction(plan.id, {
      empriseM2: 100, largeurM: 10, profondeurM: 10, nbNiveaux: 1,
      pieces: [
        { nom: "Chambre 1", typeExtrait: "chambre", surfaceM2: 12, niveauIndex: 0, xM: 0, yM: 0, largeurM: 3, profondeurM: 4 },
        { nom: "Chambre 2", typeExtrait: "chambre", surfaceM2: 12, niveauIndex: 0, xM: 3, yM: 0, largeurM: 3, profondeurM: 4 },
      ],
    });
    await validerPlanReference(plan.id);

    expect((await listerPlansReferenceValides(2)).find((p) => p.plan.id === plan.id)).toBeDefined();
    expect((await listerPlansReferenceValides(3)).find((p) => p.plan.id === plan.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/banque-plans.test.ts`
Expected: FAIL — `listerPlansReferenceValides` not exported yet.

- [ ] **Step 3: Implement**

In `src/lib/banque-plans.ts`, add:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/banque-plans.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/banque-plans.ts src/lib/banque-plans.test.ts
git commit -m "feat: list validated reference plans eligible for exact-copy mode"
```

---

## Task 6: `genererPlan` accepts optional ratios

**Files:**
- Modify: `src/lib/plan-generator.ts`
- Test: `src/lib/plan-generator.test.ts` (new file)

**Interfaces:**
- Produces: `genererPlan(reponses, surfaceEmpriseM2, nbNiveaux, ratioCirculation?, ratios?)` — new optional 5th parameter `ratios: Partial<Record<TypePiece, number>>`. Consumed by Task 9.

- [ ] **Step 1: Write the failing test**

Create `src/lib/plan-generator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { genererPlan, type ReponsesQuestionnaire } from "./plan-generator";

const REPONSES: ReponsesQuestionnaire = {
  nbChambres: 2,
  salonOuvertSurCuisine: false,
  nbChambresAvecToiletteInterne: 0,
  toilettesVisiteurs: false,
  nbCouleurs: 1,
};

describe("genererPlan avec ratios personnalisés", () => {
  it("utilise le ratio fourni pour le salon au lieu de la constante par défaut", () => {
    const planDefaut = genererPlan(REPONSES, 100, 1);
    const salonDefaut = planDefaut.niveaux[0].pieces.find((p) => p.id === "salon")!;
    const surfaceDefaut = salonDefaut.rect.width * salonDefaut.rect.height;

    const planPersonnalise = genererPlan(REPONSES, 100, 1, undefined, { salon: 0.4 });
    const salonPersonnalise = planPersonnalise.niveaux[0].pieces.find((p) => p.id === "salon")!;
    const surfacePersonnalisee = salonPersonnalise.rect.width * salonPersonnalise.rect.height;

    expect(surfacePersonnalisee).toBeGreaterThan(surfaceDefaut);
  });

  it("retombe sur la constante par défaut pour un type absent du mapping", () => {
    const planDefaut = genererPlan(REPONSES, 100, 1);
    const planPartiel = genererPlan(REPONSES, 100, 1, undefined, { salon: 0.4 });
    const cuisineDefaut = planDefaut.niveaux[0].pieces.find((p) => p.id === "cuisine")!;
    const cuisinePartielle = planPartiel.niveaux[0].pieces.find((p) => p.id === "cuisine")!;
    expect(cuisinePartielle.rect.width * cuisinePartielle.rect.height).toBeCloseTo(
      cuisineDefaut.rect.width * cuisineDefaut.rect.height,
      5
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/plan-generator.test.ts`
Expected: FAIL — `genererPlan` doesn't accept the ratios argument, so both plans are identical.

- [ ] **Step 3: Implement**

In `src/lib/plan-generator.ts`, update the `genererPlan` signature (add `ratios` param, pass through to `piecesDuNiveau`):

```ts
export function genererPlan(
  reponses: ReponsesQuestionnaire,
  surfaceEmpriseM2: number,
  nbNiveaux: number,
  ratioCirculation: number = RATIO_CIRCULATION_DEFAUT,
  ratios: Partial<Record<TypePiece, number>> = {}
): Plan {
  // ... corps inchangé jusqu'à l'appel à piecesDuNiveau, qui reçoit désormais ratios en dernier argument
```

Find every call site of `piecesDuNiveau(...)` inside `genererPlan` and append `, ratios` as the last argument.

Update `piecesDuNiveau` to accept and apply `ratios`:

```ts
function piecesDuNiveau(
  niveauIndex: number,
  nbChambres: number,
  nbChambresAvecToiletteInterne: number,
  toilettesVisiteurs: boolean,
  surfaceParNiveau: number,
  ratioCirculation: number,
  ratios: Partial<Record<TypePiece, number>>
): { id: string; type: TypePiece; nom: string; surfaceCibleM2: number }[] {
  const pieces: { id: string; type: TypePiece; nom: string; surfaceCibleM2: number }[] = [];

  // Ratios calés sur les plans SNHLM Bambilor, remplacés par les ratios
  // dérivés de la banque de plans validés quand fournis (phase 2).
  const RATIO_SALON = ratios.salon ?? 0.22;
  const RATIO_CUISINE = ratios.cuisine ?? 0.1;
  const RATIO_CIRCULATION = ratios.circulation ?? ratioCirculation;
  const RATIO_WC_VISITEURS = ratios.wc ?? 0.03;
  const RATIO_SDB_PARENTS = ratios.sdb ?? 0.04;
  const RATIO_SDB_SECONDAIRE = ratios.sdb ?? 0.035;
  // ... reste de la fonction inchangé
```

Only the constant declarations change from literals to `ratios.<type> ?? <literal>`. `ratioCirculation` (existing param) stays the fallback under `ratios.circulation`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/plan-generator.test.ts`
Expected: PASS

- [ ] **Step 5: Full suite regression check**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/plan-generator.ts src/lib/plan-generator.test.ts
git commit -m "feat: genererPlan accepts bank-derived room ratios"
```

---

## Task 7: `genererPlanDepuisReference` (exact-copy mode)

**Files:**
- Modify: `src/lib/plan-generator.ts`
- Test: `src/lib/plan-generator.test.ts`

**Interfaces:**
- Consumes: `PlanReferenceAvecPieces` type from Task 5 (type-only import from `src/lib/banque-plans.ts`).
- Produces: `genererPlanDepuisReference(referencePlan: PlanReferenceAvecPieces, surfaceEmpriseM2Cible: number, nbNiveauxCible: number): Plan`. Pure/DB-free — caller (Task 9) fetches the reference plan first via `obtenirPlanReference`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/plan-generator.test.ts`:

```ts
import { genererPlanDepuisReference } from "./plan-generator";
import type { PlanReferenceAvecPieces } from "./banque-plans";

function planReferenceTest(): PlanReferenceAvecPieces {
  return {
    plan: {
      id: 1,
      source: null,
      imageUrl: "https://example.com/p.png",
      empriseM2: "100.00",
      largeurM: "10.00",
      profondeurM: "10.00",
      nbNiveaux: 1,
      statut: "valide",
      createdAt: new Date(),
    },
    pieces: [
      {
        id: 1, planReferenceId: 1, typeExtrait: "salon", nom: "Salon", surfaceM2: "20.00",
        niveauIndex: 0, xM: "0.00", yM: "0.00", largeurM: "5.00", profondeurM: "4.00",
      },
      {
        id: 2, planReferenceId: 1, typeExtrait: "chambre", nom: "Chambre 1", surfaceM2: "16.00",
        niveauIndex: 0, xM: "5.00", yM: "0.00", largeurM: "4.00", profondeurM: "4.00",
      },
    ],
  };
}

describe("genererPlanDepuisReference", () => {
  it("met à l'échelle les positions/dimensions par racine du ratio de surface", () => {
    const plan = genererPlanDepuisReference(planReferenceTest(), 400, 1); // 4x la surface -> k=2
    const salon = plan.niveaux[0].pieces.find((p) => p.nom === "Salon")!;
    expect(salon.rect.width).toBeCloseTo(10, 5);
    expect(salon.rect.height).toBeCloseTo(8, 5);
    expect(salon.type).toBe("salon");
  });

  it("tronque les niveaux excédentaires quand nbNiveauxCible < niveaux de référence", () => {
    const reference = planReferenceTest();
    reference.plan.nbNiveaux = 2;
    reference.pieces.push({
      id: 3, planReferenceId: 1, typeExtrait: "chambre", nom: "Chambre étage", surfaceM2: "12.00",
      niveauIndex: 1, xM: "0.00", yM: "0.00", largeurM: "3.00", profondeurM: "4.00",
    });
    const plan = genererPlanDepuisReference(reference, 100, 1);
    expect(plan.niveaux).toHaveLength(1);
    expect(plan.niveaux[0].index).toBe(0);
  });

  it("duplique le dernier niveau quand nbNiveauxCible > niveaux de référence", () => {
    const plan = genererPlanDepuisReference(planReferenceTest(), 100, 2);
    expect(plan.niveaux).toHaveLength(2);
    expect(plan.niveaux[1].index).toBe(1);
    expect(plan.niveaux[1].pieces.map((p) => p.nom)).toEqual(plan.niveaux[0].pieces.map((p) => p.nom));
  });

  it("lève une erreur si une pièce n'a pas de position complète", () => {
    const reference = planReferenceTest();
    reference.pieces[0].xM = null;
    expect(() => genererPlanDepuisReference(reference, 100, 1)).toThrow();
  });

  it("génère des ouvertures via genererPortes/genererFenetres réutilisés", () => {
    const plan = genererPlanDepuisReference(planReferenceTest(), 100, 1);
    expect(plan.niveaux[0].ouvertures.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/plan-generator.test.ts`
Expected: FAIL — `genererPlanDepuisReference` not exported yet.

- [ ] **Step 3: Implement**

In `src/lib/plan-generator.ts`, add after `genererPlan` (before or after the private `genererPortes`/`genererFenetres` — both already defined in this file and directly callable):

```ts
import type { PlanReferenceAvecPieces } from "./banque-plans";

const CORRESPONDANCE_TYPE_EXTRAIT_LOCALE: Record<string, TypePiece> = {
  salon: "salon",
  cuisine: "cuisine",
  chambre: "chambre",
  wc: "wc",
  circulation: "circulation",
  sdb: "sdb",
};

function mapperTypeExtraitLocal(typeExtrait: string): TypePiece {
  return CORRESPONDANCE_TYPE_EXTRAIT_LOCALE[typeExtrait.toLowerCase().trim()] ?? "circulation";
}

/**
 * Reproduit exactement l'agencement d'un plan de référence choisi par
 * l'utilisateur, mis à l'échelle sur la surface cible du projet, avec
 * troncature ou duplication de niveaux pour atteindre nbNiveauxCible.
 * Ouvertures dérivées géométriquement via genererPortes/genererFenetres.
 */
export function genererPlanDepuisReference(
  referencePlan: PlanReferenceAvecPieces,
  surfaceEmpriseM2Cible: number,
  nbNiveauxCible: number
): Plan {
  const { plan, pieces } = referencePlan;

  const empriseReference = Number(plan.empriseM2);
  if (!empriseReference) {
    throw new Error("Le plan de référence n'a pas d'emprise renseignée");
  }
  if (pieces.some((p) => p.xM === null || p.yM === null || p.largeurM === null || p.profondeurM === null)) {
    throw new Error(
      "Ce plan n'a pas encore de positions extraites, réessaie l'extraction depuis /banque-plans avant de le choisir"
    );
  }

  const k = Math.sqrt(surfaceEmpriseM2Cible / empriseReference);
  const largeurReferenceM = Number(plan.largeurM);
  const profondeurReferenceM = Number(plan.profondeurM);

  const niveauxReference = new Map<number, typeof pieces>();
  for (const piece of pieces) {
    const liste = niveauxReference.get(piece.niveauIndex) ?? [];
    liste.push(piece);
    niveauxReference.set(piece.niveauIndex, liste);
  }
  const indexNiveauxTries = [...niveauxReference.keys()].sort((a, b) => a - b);

  const indexNiveauxCibles: number[] = [];
  for (let i = 0; i < nbNiveauxCible; i++) {
    indexNiveauxCibles.push(indexNiveauxTries[Math.min(i, indexNiveauxTries.length - 1)]);
  }

  const largeurM = largeurReferenceM * k;
  const profondeurM = profondeurReferenceM * k;

  const niveaux: Niveau[] = indexNiveauxCibles.map((indexReference, indexCible) => {
    const piecesNiveau = niveauxReference.get(indexReference)!;
    const piecesMisesEchelle: Piece[] = piecesNiveau.map((p, i) => ({
      id: `ref-${indexCible}-${i}`,
      type: mapperTypeExtraitLocal(p.typeExtrait),
      nom: p.nom,
      rect: {
        x: Number(p.xM) * k,
        y: Number(p.yM) * k,
        width: Number(p.largeurM) * k,
        height: Number(p.profondeurM) * k,
      },
    }));

    return {
      index: indexCible,
      largeurM,
      profondeurM,
      pieces: piecesMisesEchelle,
      ouvertures: [
        ...genererPortes(piecesMisesEchelle),
        ...genererFenetres(piecesMisesEchelle, largeurM, profondeurM),
      ],
    };
  });

  return { niveaux };
}
```

`import type { PlanReferenceAvecPieces } from "./banque-plans";` is type-only and elided at compile time — `banque-plans.ts` also only type-imports `TypePiece` from this file, so there's no runtime circular dependency.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/plan-generator.test.ts`
Expected: PASS

- [ ] **Step 5: Full suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/plan-generator.ts src/lib/plan-generator.test.ts
git commit -m "feat: generate exact-copy plans scaled from a chosen reference plan"
```

---

## Task 8: Wire dispatch logic into `projets.ts`

**Files:**
- Modify: `src/lib/projets.ts`
- Modify: `src/lib/banque-plans.ts`

**Interfaces:**
- Consumes: `calculerRatiosDepuisBanque` (Task 4), `obtenirPlanReference` (existing), `genererPlanDepuisReference` (Task 7), `genererPlan` with `ratios` (Task 6).
- Produces: `CreationProjet.planReferenceId?: number | null`. Consumed by Task 9.

- [ ] **Step 1: Update `CreationProjet` type**

In `src/lib/projets.ts`:

```ts
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
  planReferenceId?: number | null;
};
```

- [ ] **Step 2: Add dispatch helper, use it in `creerProjet`/`modifierProjet`**

Update the imports at the top of `src/lib/projets.ts`:

```ts
import { db } from "@/db";
import { projets, type Projet, type NouveauProjet } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { genererPlan, genererPlanDepuisReference, type ReponsesQuestionnaire, type Plan } from "./plan-generator";
import { obtenirRatio } from "./params";
import { calculerRatiosDepuisBanque, obtenirPlanReference } from "./banque-plans";

const CLE_RATIO_CIRCULATION = "ratio_circulation_par_m2_batie";
```

Add right after the `CreationProjet` type:

```ts
/** Génère le plan d'un projet : copie exacte si un planReferenceId est
 * fourni et éligible, sinon génération par ratios (dérivés de la banque
 * de plans validés si disponible, sinon constantes par défaut). */
async function genererPlanPourProjet(input: CreationProjet): Promise<Plan> {
  if (input.planReferenceId) {
    const reference = await obtenirPlanReference(input.planReferenceId);
    if (reference) {
      return genererPlanDepuisReference(reference, input.surfaceBatieM2, input.nbNiveaux);
    }
  }
  const ratioCirculation = await obtenirRatio(CLE_RATIO_CIRCULATION);
  const ratios = await calculerRatiosDepuisBanque();
  return genererPlan(input.reponsesQuestionnaire, input.surfaceBatieM2, input.nbNiveaux, ratioCirculation, ratios);
}
```

Update `creerProjet`:

```ts
export async function creerProjet(input: CreationProjet, userId: number): Promise<Projet> {
  const plan = await genererPlanPourProjet(input);

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
      planReferenceId: input.planReferenceId ?? null,
      planGenere: plan,
    })
    .returning();

  return projet;
}
```

Update `modifierProjet` the same way:

```ts
export async function modifierProjet(
  id: number,
  input: CreationProjet,
  userId: number
): Promise<Projet | undefined> {
  const plan = await genererPlanPourProjet(input);

  const [projet] = await db
    .update(projets)
    .set({
      nom: input.nom,
      surfaceTerrainM2: String(input.surfaceTerrainM2),
      surfaceBatieM2: String(input.surfaceBatieM2),
      typeStructure: input.typeStructure,
      nbNiveaux: input.nbNiveaux,
      typeToiture: input.typeToiture,
      standing: input.standing,
      modeBriques: input.modeBriques,
      reponsesQuestionnaire: input.reponsesQuestionnaire,
      planReferenceId: input.planReferenceId ?? null,
      planGenere: plan,
      updatedAt: new Date(),
    })
    .where(and(eq(projets.id, id), eq(projets.userId, userId)))
    .returning();

  return projet;
}
```

`obtenirPlanReference`'s current return type `{ plan: PlanReference; pieces: PlanReferencePiece[] } | null` is structurally identical to `PlanReferenceAvecPieces | null` — update the annotation in `src/lib/banque-plans.ts` to reuse the named type for consistency (type-only change, no behavior change):

```ts
export async function obtenirPlanReference(id: number): Promise<PlanReferenceAvecPieces | null> {
```

- [ ] **Step 3: Full suite**

Run: `pnpm test`
Expected: PASS — behavior-preserving change; underlying functions already covered by Tasks 4–7's tests.

- [ ] **Step 4: Commit**

```bash
git add src/lib/projets.ts src/lib/banque-plans.ts
git commit -m "feat: dispatch project plan generation to exact-copy or ratio mode"
```

---

## Task 9: Reference-plan gallery selector in the project form

**Files:**
- Modify: `src/components/nouveau-projet-form.tsx`
- Modify: `src/app/nouveau/page.tsx`
- Modify: `src/app/projets/[id]/modifier/page.tsx`

**Interfaces:**
- Consumes: `listerPlansReferenceValides` (Task 5), `PlanReferenceAvecPieces` (Task 5), `CreationProjet.planReferenceId` (Task 8).
- Produces: `NouveauProjetForm` gains a `plansDisponibles: PlanReferenceAvecPieces[]` prop.

- [ ] **Step 1: Pass the reference-plan list from both pages**

`src/app/nouveau/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { listerPlansReferenceValides } from "@/lib/banque-plans";
import { NouveauProjetForm } from "@/components/nouveau-projet-form";

export default async function NouveauProjetPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const plansDisponibles = await listerPlansReferenceValides();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-[17px] text-primary transition-colors hover:underline"
      >
        <ArrowLeft className="size-4" />
        Retour aux projets
      </Link>
      <NouveauProjetForm plansDisponibles={plansDisponibles} />
    </div>
  );
}
```

`src/app/projets/[id]/modifier/page.tsx`:

```tsx
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { obtenirProjet } from "@/lib/projets";
import { listerPlansReferenceValides } from "@/lib/banque-plans";
import { NouveauProjetForm } from "@/components/nouveau-projet-form";

export default async function ModifierProjetPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const projet = await obtenirProjet(Number(id), session.user.id);
  if (!projet) notFound();

  const plansDisponibles = await listerPlansReferenceValides();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <Link
        href={`/projets/${projet.id}`}
        className="mb-6 inline-flex items-center gap-2 text-[17px] text-primary transition-colors hover:underline"
      >
        <ArrowLeft className="size-4" />
        Retour au projet
      </Link>
      <NouveauProjetForm projetExistant={projet} plansDisponibles={plansDisponibles} />
    </div>
  );
}
```

- [ ] **Step 2: Add the gallery to `NouveauProjetForm`**

In `src/components/nouveau-projet-form.tsx`, add the import:

```tsx
import type { PlanReferenceAvecPieces } from "@/lib/banque-plans";
```

Extend `Etat` and `ETAT_INITIAL`:

```ts
type Etat = {
  nom: string;
  surfaceTerrainM2: string;
  surfaceBatieM2: string;
  nbChambres: string;
  nbNiveaux: string;
  nbChambresAvecToiletteInterne: string;
  toilettesVisiteurs: boolean;
  nbCouleurs: string;
  typeStructure: NouveauProjet["typeStructure"];
  typeToiture: NouveauProjet["typeToiture"];
  standing: NouveauProjet["standing"];
  modeBriques: NouveauProjet["modeBriques"];
  planReferenceId: number | null;
};

const ETAT_INITIAL: Etat = {
  nom: "",
  surfaceTerrainM2: "",
  surfaceBatieM2: "",
  nbChambres: "3",
  nbNiveaux: "1",
  nbChambresAvecToiletteInterne: "0",
  toilettesVisiteurs: true,
  nbCouleurs: "1",
  typeStructure: "parpaing",
  typeToiture: "dalle_beton",
  standing: "moyen",
  modeBriques: "usine",
  planReferenceId: null,
};
```

Update `etatDepuisProjet` to include `planReferenceId: projet.planReferenceId` in its returned object (alongside the existing fields).

Update the component signature:

```tsx
export function NouveauProjetForm({
  projetExistant,
  plansDisponibles,
}: {
  projetExistant?: Projet;
  plansDisponibles: PlanReferenceAvecPieces[];
}) {
  const [etat, setEtat] = useState<Etat>(
    projetExistant ? etatDepuisProjet(projetExistant) : ETAT_INITIAL
  );
  // ... erreur/enCours/majChamp inchangés

  const nbChambresDemande = Number(etat.nbChambres) || 0;
  const plansCompatibles = plansDisponibles.filter(
    (p) => p.pieces.filter((piece) => piece.typeExtrait.toLowerCase() === "chambre").length >= nbChambresDemande
  );
```

In `soumettre()`, add `planReferenceId: etat.planReferenceId,` to the `input` object literal (after `modeBriques`, before `reponsesQuestionnaire`).

Insert this new section right after the chambres/niveaux grid, before the toilettes-internes grid:

```tsx
        <div className="space-y-2">
          <Label>Plan de référence (optionnel)</Label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => majChamp("planReferenceId", null)}
              className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                etat.planReferenceId === null
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="mb-2 flex h-20 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                Auto
              </div>
              Aucun — génération automatique
            </button>
            {plansCompatibles.map(({ plan, pieces }) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => majChamp("planReferenceId", plan.id)}
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                  etat.planReferenceId === plan.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <img
                  src={plan.imageUrl}
                  alt={`Plan de référence ${plan.id}`}
                  className="mb-2 h-20 w-full rounded object-cover"
                />
                {Number(plan.empriseM2)} m² · {pieces.length} pièces
              </button>
            ))}
          </div>
        </div>
```

- [ ] **Step 3: Confirm `actions.ts` needs no change**

Run: `grep -n "CreationProjet" src/app/actions.ts`
Expected: both `creerProjetAction`/`modifierProjetAction` already take `input: CreationProjet` — since `planReferenceId` is now part of that type, no edit needed there.

- [ ] **Step 4: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Full suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Manual verification in dev**

Run: `pnpm dev`
1. `/banque-plans` — confirm at least one plan validated with full position data (re-run extraction via "Réessayer" on an existing plan if needed to pick up Task 2's new prompt fields).
2. `/nouveau` — confirm gallery shows "Aucun" plus validated plan(s), filtering as `nbChambres` changes.
3. Select a reference plan, submit, confirm 3D viewer layout visually matches the source image.
4. Submit with "Aucun" selected, confirm ratio-based layout as before.

- [ ] **Step 7: Commit**

```bash
git add src/components/nouveau-projet-form.tsx src/app/nouveau/page.tsx src/app/projets/[id]/modifier/page.tsx
git commit -m "feat: add reference-plan gallery selector to the project form"
```

---

## Self-Review Notes

- **Spec coverage:** Extraction schema (spec §1) → Tasks 2–3. Mode ratio (§2) → Tasks 4, 6. Mode copie-exacte (§3) → Tasks 5, 7. Data model + UI (§4) → Tasks 1, 8, 9. Gestion des erreurs (position incomplète) → Task 7 Step 3 throw + Task 5's eligibility filter. All spec sections covered.
- **Placeholder scan:** none — every step carries runnable code and exact commands.
- **Type consistency:** `PlanReferenceAvecPieces` (Task 5) reused identically in Task 7's parameter, Task 8's `obtenirPlanReference` return type, and Task 9's component prop. `mapperTypeExtrait` (Task 4, `banque-plans.ts`) and `mapperTypeExtraitLocal` (Task 7, `plan-generator.ts`) are intentionally separate small lookup tables — `plan-generator.ts` cannot import runtime code from `banque-plans.ts` without creating a real cycle, since `banque-plans.ts` already imports `TypePiece` from `plan-generator.ts`.
