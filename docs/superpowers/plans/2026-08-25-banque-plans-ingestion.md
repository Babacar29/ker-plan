# Banque de plans — Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-only "Banque de plans" pipeline that lets the user upload a real floor-plan image, auto-extracts structured data (rooms, areas, envelope dimensions) via a vision LLM, and stores it in Postgres after a manual review/correction step.

**Architecture:** Next.js App Router route group `/banque-plans` (protected the same way as `/parametres`) with a list+upload page and a `[id]` review page. Business logic lives in `src/lib/banque-plans.ts` (CRUD, mirrors `src/lib/params.ts`) and `src/lib/extraction-plan.ts` (isolated vision LLM call). Mutations go through `src/app/banque-plans/actions.ts` server actions (mirrors `src/app/actions.ts`). Two new Drizzle tables (`plansReference`, `plansReferencePieces`) plus a status enum.

**Tech Stack:** Next.js App Router, Drizzle ORM (Postgres/Neon), `@vercel/blob` for image storage, `ai` package (`generateText` + `Output.object()`) via Vercel AI Gateway with `anthropic/claude-sonnet-5`, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-banque-plans-ingestion-design.md`

## Global Constraints

- French-language code identifiers and UI copy (matches rest of codebase).
- Session-based auth only — reuse `getSession()` / redirect `/login` pattern, no new role system.
- Ratios (`surfaceM2 / empriseM2`) are computed at read time, never stored.
- `statut: "brouillon"` rows must never be queried by future Phase 2 code — always filter `statut = "valide"` in any read path meant for consumption outside this feature.
- No Playwright E2E test for real image upload/vision call (cost, flakiness) — manual dev verification only.
- Model string via AI Gateway: `anthropic/claude-sonnet-5` (verified current via `https://ai-gateway.vercel.sh/v1/models`).
- Use `generateText` with `Output.object()` (current `ai@7` API) — `generateObject` is deprecated in the installed version.

---

### Task 1: Data model — `plansReference` / `plansReferencePieces`

**Files:**
- Modify: `src/db/schema.ts`

**Interfaces:**
- Produces: `statutPlanReferenceEnum` (pgEnum: `"brouillon" | "valide"`), `plansReference` table, `plansReferencePieces` table, exported types `PlanReference`, `NouveauPlanReference`, `PlanReferencePiece`.

- [ ] **Step 1: Add the enum and tables to `src/db/schema.ts`**

Append at the end of the file:

```ts
export const statutPlanReferenceEnum = pgEnum("statut_plan_reference", [
  "brouillon",
  "valide",
]);

/** Un plan de référence ingéré depuis une image (photo/capture d'écran d'un vrai plan). */
export const plansReference = pgTable("plans_reference", {
  id: serial("id").primaryKey(),
  source: text("source"),
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
  typeExtrait: text("type_extrait").notNull(),
  nom: text("nom").notNull(),
  surfaceM2: numeric("surface_m2", { precision: 10, scale: 2 }).notNull(),
});

export type PlanReference = typeof plansReference.$inferSelect;
export type NouveauPlanReference = typeof plansReference.$inferInsert;
export type PlanReferencePiece = typeof plansReferencePieces.$inferSelect;
```

- [ ] **Step 2: Push the schema to the database**

Run: `npx dotenv -e .env.local -- npx drizzle-kit push`
Expected: prompts (if any) accept table/enum creation, ends with success message. Confirm no destructive warnings about existing tables.

- [ ] **Step 3: Verify with typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat: add plans_reference schema for banque de plans"
```

---

### Task 2: `src/lib/extraction-plan.ts` — vision extraction

**Files:**
- Create: `src/lib/extraction-plan.ts`
- Test: `src/lib/extraction-plan.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (standalone module).
- Produces:
  - `SchemaExtractionPlan` (Zod schema, exported)
  - `type ExtractionPlan = z.infer<typeof SchemaExtractionPlan>` — shape: `{ empriseM2: number; largeurM: number; profondeurM: number; nbNiveaux: number; pieces: { nom: string; typeExtrait: string; surfaceM2: number }[] }`
  - `async function extraireDonneesPlan(imageUrl: string): Promise<ExtractionPlan>` — throws on model/validation failure (caller handles error state).

- [ ] **Step 0: Verify the `generateText` return field name against the installed `ai` package before writing code**

Run: `grep -n "experimental_output\|output:" node_modules/ai/src/generate-text/generate-text.ts | head -30`

This confirms whether the resolved structured output on the `generateText()` result is exposed as `result.experimental_output` or `result.output` in the installed version. Use whichever field this grep confirms in Steps 1 and 3 below (replace every occurrence of `experimental_output` accordingly if the installed version differs).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/extraction-plan.test.ts
import { describe, it, expect, vi } from "vitest";

const generateTextMock = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  Output: { object: (config: unknown) => ({ type: "object", ...(config as object) }) },
}));

import { extraireDonneesPlan, SchemaExtractionPlan } from "./extraction-plan";

describe("extraireDonneesPlan", () => {
  it("retourne l'objet extrait validé par le schéma", async () => {
    const donnees = {
      empriseM2: 120,
      largeurM: 10,
      profondeurM: 12,
      nbNiveaux: 1,
      pieces: [
        { nom: "Salon", typeExtrait: "salon", surfaceM2: 25 },
        { nom: "CH1", typeExtrait: "chambre", surfaceM2: 12 },
      ],
    };
    generateTextMock.mockResolvedValue({ experimental_output: donnees });

    const resultat = await extraireDonneesPlan("https://blob.example/plan.png");

    expect(resultat).toEqual(donnees);
    expect(SchemaExtractionPlan.safeParse(resultat).success).toBe(true);
  });

  it("rejette une réponse dont le schéma est invalide", async () => {
    generateTextMock.mockResolvedValue({
      experimental_output: { empriseM2: "pas un nombre", pieces: [] },
    });

    await expect(extraireDonneesPlan("https://blob.example/plan.png")).rejects.toThrow();
  });

  it("propage l'erreur si le modèle échoue", async () => {
    generateTextMock.mockRejectedValue(new Error("timeout"));

    await expect(extraireDonneesPlan("https://blob.example/plan.png")).rejects.toThrow("timeout");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/extraction-plan.test.ts`
Expected: FAIL — `Cannot find module './extraction-plan'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/extraction-plan.ts
import { generateText, Output } from "ai";
import { z } from "zod";

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
    })
  ),
});

export type ExtractionPlan = z.infer<typeof SchemaExtractionPlan>;

const MODELE_VISION = "anthropic/claude-sonnet-5";

const PROMPT_EXTRACTION = `Tu es un architecte qui lit un plan de maison réel (capture d'écran ou photo).
Extrais les informations suivantes en respectant les conventions observées sur ce type de plan :
- la surface totale de l'emprise au sol en m² (souvent affichée dans un encadré bleu)
- la largeur et la profondeur de l'emprise en mètres (déduites des cotes en cm le long des bords, converties en mètres)
- le nombre de niveaux (RDC seul = 1, RDC + étage = 2, etc.)
- la liste des pièces avec leur nom tel qu'affiché (ex: "SDB", "CH1", "cour de service", "espace familial"), un type extrait normalisé en minuscules (ex: "chambre", "salon", "cuisine", "sdb", "wc", "circulation", "cour", "patio", "garage", ou un autre libellé court si aucun type standard ne correspond), et leur surface en m².
Si une valeur n'est pas lisible sur le plan, fais la meilleure estimation possible à partir des cotes visibles plutôt que de l'omettre.`;

export async function extraireDonneesPlan(imageUrl: string): Promise<ExtractionPlan> {
  const { experimental_output } = (await generateText({
    model: MODELE_VISION,
    output: Output.object({ schema: SchemaExtractionPlan }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT_EXTRACTION },
          { type: "file", data: new URL(imageUrl), mediaType: "image" },
        ],
      },
    ],
  })) as { experimental_output: unknown };

  return SchemaExtractionPlan.parse(experimental_output);
}
```

If Step 0's grep showed the field is `output` instead of `experimental_output` in the installed version, replace both occurrences above (destructure and cast) accordingly, and update the test mock's return shape (`{ output: donnees }` instead of `{ experimental_output: donnees }`) to match.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/extraction-plan.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/extraction-plan.ts src/lib/extraction-plan.test.ts
git commit -m "feat: add vision extraction for reference plans"
```

---

### Task 3: `src/lib/banque-plans.ts` — CRUD

**Files:**
- Create: `src/lib/banque-plans.ts`
- Test: `src/lib/banque-plans.test.ts`

**Interfaces:**
- Consumes: `plansReference`, `plansReferencePieces`, `PlanReference`, `PlanReferencePiece` from `@/db/schema` (Task 1); `ExtractionPlan` type from `@/lib/extraction-plan` (Task 2).
- Produces:
  - `async function creerPlanReferenceBrouillon(imageUrl: string, source?: string): Promise<PlanReference>`
  - `async function listerPlansReference(): Promise<PlanReference[]>`
  - `async function obtenirPlanReference(id: number): Promise<{ plan: PlanReference; pieces: PlanReferencePiece[] } | null>`
  - `async function enregistrerExtraction(id: number, donnees: ExtractionPlan): Promise<void>` — updates plan fields + inserts pieces, status stays `"brouillon"`.
  - `async function mettreAJourPiece(id: number, champs: { nom?: string; typeExtrait?: string; surfaceM2?: number }): Promise<void>`
  - `async function validerPlanReference(id: number): Promise<void>` — sets `statut: "valide"`.
  - `async function supprimerPlanReference(id: number): Promise<void>`
  - `function ratioPiece(piece: { surfaceM2: number | string }, plan: { empriseM2: number | string | null }): number | null` — pure helper, `surfaceM2 / empriseM2`, `null` if `empriseM2` is null/0.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/banque-plans.test.ts
import { describe, it, expect } from "vitest";
import { ratioPiece } from "./banque-plans";

describe("ratioPiece", () => {
  it("calcule le ratio surface pièce / emprise", () => {
    expect(ratioPiece({ surfaceM2: 25 }, { empriseM2: 100 })).toBe(0.25);
  });

  it("accepte des valeurs numeric renvoyées par Drizzle en string", () => {
    expect(ratioPiece({ surfaceM2: "12.50" }, { empriseM2: "100.00" })).toBe(0.125);
  });

  it("retourne null si l'emprise est nulle", () => {
    expect(ratioPiece({ surfaceM2: 25 }, { empriseM2: null })).toBeNull();
  });

  it("retourne null si l'emprise vaut 0", () => {
    expect(ratioPiece({ surfaceM2: 25 }, { empriseM2: 0 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/banque-plans.test.ts`
Expected: FAIL — `Cannot find module './banque-plans'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/banque-plans.ts
import { db } from "@/db";
import { plansReference, plansReferencePieces } from "@/db/schema";
import type { PlanReference, PlanReferencePiece } from "@/db/schema";
import type { ExtractionPlan } from "@/lib/extraction-plan";
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/banque-plans.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/banque-plans.ts src/lib/banque-plans.test.ts
git commit -m "feat: add banque-plans CRUD layer"
```

---

### Task 4: `src/app/banque-plans/actions.ts` — server actions + Blob upload

**Files:**
- Create: `src/app/banque-plans/actions.ts`
- Modify: `package.json` (add `@vercel/blob` dependency)

**Interfaces:**
- Consumes: `getSession` from `@/lib/auth`; `creerPlanReferenceBrouillon`, `enregistrerExtraction`, `mettreAJourPiece`, `validerPlanReference`, `supprimerPlanReference` from `@/lib/banque-plans` (Task 3); `extraireDonneesPlan` from `@/lib/extraction-plan` (Task 2).
- Produces:
  - `async function uploaderPlanAction(formData: FormData): Promise<void>` — reads `formData.get("image")` (File) and `formData.get("source")` (string), uploads to Blob, creates draft row, runs extraction, redirects to `/banque-plans/[id]`.
  - `async function relancerExtractionAction(id: number, imageUrl: string): Promise<void>`
  - `async function mettreAJourPieceAction(id: number, champs: { nom?: string; typeExtrait?: string; surfaceM2?: number }): Promise<void>`
  - `async function validerPlanReferenceAction(id: number): Promise<void>`
  - `async function supprimerPlanReferenceAction(id: number): Promise<void>`

- [ ] **Step 1: Install `@vercel/blob`**

Run: `pnpm add @vercel/blob`
Expected: added to `package.json` dependencies.

- [ ] **Step 2: Confirm the `put()` signature against the installed package before writing code**

Run: `grep -n "export declare function put" node_modules/@vercel/blob/dist/index.d.ts`

Confirms the accepted body type for the second argument (used in Step 3 below — adjust the `put(...)` call if the installed signature differs from a raw `File`).

- [ ] **Step 3: Write the server actions**

```ts
// src/app/banque-plans/actions.ts
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
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If Step 2's grep showed `put()` doesn't accept a `File` directly, adjust the call (e.g. pass `image` as-is only if it satisfies the confirmed `PutBody` union — a `File` implements `Blob`, which is normally accepted).

- [ ] **Step 5: Commit**

```bash
git add src/app/banque-plans/actions.ts package.json pnpm-lock.yaml
git commit -m "feat: add banque-plans server actions with blob upload"
```

---

### Task 5: `/banque-plans` — list + upload page

**Files:**
- Create: `src/app/banque-plans/page.tsx`
- Create: `src/components/banque-plans/upload-form.tsx`

**Interfaces:**
- Consumes: `getSession` from `@/lib/auth`; `listerPlansReference` from `@/lib/banque-plans` (Task 3); `uploaderPlanAction`, `supprimerPlanReferenceAction` from `@/app/banque-plans/actions` (Task 4).
- Produces: default export `BanquePlansPage` (server component), named export `UploadForm` (client component) consumed only by this page.

- [ ] **Step 1: Write the upload form (client component)**

```tsx
// src/components/banque-plans/upload-form.tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { uploaderPlanAction } from "@/app/banque-plans/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function UploadForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setErreur(null);
    startTransition(async () => {
      try {
        await uploaderPlanAction(formData);
      } catch (error) {
        if (error instanceof Error && error.message !== "NEXT_REDIRECT") {
          setErreur(error.message);
        }
      }
    });
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-border p-6"
    >
      <label className="text-[15px] font-medium text-foreground" htmlFor="image">
        Image du plan
      </label>
      <Input id="image" name="image" type="file" accept="image/*" required />

      <label className="text-[15px] font-medium text-foreground" htmlFor="source">
        Source (optionnel)
      </label>
      <Input id="source" name="source" type="text" placeholder="ex: Sene Archi" />

      {erreur && <p className="text-[14px] text-destructive">{erreur}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Envoi et analyse..." : "Uploader et analyser"}
      </Button>
    </form>
  );
}
```

Note: server actions that call `redirect()` throw a special `NEXT_REDIRECT` error internally — the catch block above must not treat that as a real error, hence the message check.

- [ ] **Step 2: Write the page (server component)**

```tsx
// src/app/banque-plans/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listerPlansReference } from "@/lib/banque-plans";
import { UploadForm } from "@/components/banque-plans/upload-form";
import { supprimerPlanReferenceAction } from "@/app/banque-plans/actions";
import { ArrowLeft } from "lucide-react";

export default async function BanquePlansPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const plans = await listerPlansReference();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-[17px] text-primary transition-colors hover:underline"
      >
        <ArrowLeft className="size-4" /> Retour
      </Link>
      <h1 className="text-[34px] font-semibold tracking-tight text-foreground mb-2">
        Banque de plans
      </h1>
      <p className="text-[17px] text-muted-foreground mb-8">
        Uploade des plans réels pour alimenter la future banque de référence.
      </p>

      <UploadForm />

      <ul className="mt-8 space-y-3">
        {plans.map((plan) => (
          <li
            key={plan.id}
            className="flex items-center justify-between rounded-xl border border-border p-4"
          >
            <Link href={`/banque-plans/${plan.id}`} className="flex-1">
              <p className="text-[15px] font-medium text-foreground">
                {plan.source ?? "Sans source"} — {plan.empriseM2 ? `${plan.empriseM2} m²` : "en cours d'analyse"}
              </p>
              <p className="text-[13px] text-muted-foreground">{plan.statut}</p>
            </Link>
            <form action={supprimerPlanReferenceAction.bind(null, plan.id)}>
              <button type="submit" className="text-[13px] text-destructive hover:underline">
                Supprimer
              </button>
            </form>
          </li>
        ))}
        {plans.length === 0 && (
          <p className="text-[15px] text-muted-foreground">Aucun plan pour l&apos;instant.</p>
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Run lint + typecheck**

Run: `npx eslint src/app/banque-plans/page.tsx src/components/banque-plans/upload-form.tsx && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/banque-plans/page.tsx src/components/banque-plans/upload-form.tsx
git commit -m "feat: add banque-plans list and upload page"
```

---

### Task 6: `/banque-plans/[id]` — review/edit page

**Files:**
- Create: `src/app/banque-plans/[id]/page.tsx`
- Create: `src/components/banque-plans/piece-editor.tsx`

**Interfaces:**
- Consumes: `getSession` from `@/lib/auth`; `obtenirPlanReference`, `ratioPiece` from `@/lib/banque-plans` (Task 3); `relancerExtractionAction`, `mettreAJourPieceAction`, `validerPlanReferenceAction` from `@/app/banque-plans/actions` (Task 4); `PlanReferencePiece` type from `@/db/schema`.
- Produces: default export `BanquePlanDetailPage` (server component, params `{ id: string }`), named export `PieceEditor` (client component).

- [ ] **Step 1: Write the piece editor (client component)**

```tsx
// src/components/banque-plans/piece-editor.tsx
"use client";

import { useState, useTransition } from "react";
import { mettreAJourPieceAction } from "@/app/banque-plans/actions";
import { Input } from "@/components/ui/input";
import type { PlanReferencePiece } from "@/db/schema";

type Props = {
  piece: PlanReferencePiece;
  ratio: number | null;
};

export function PieceEditor({ piece, ratio }: Props) {
  const [nom, setNom] = useState(piece.nom);
  const [typeExtrait, setTypeExtrait] = useState(piece.typeExtrait);
  const [surfaceM2, setSurfaceM2] = useState(String(piece.surfaceM2));
  const [isPending, startTransition] = useTransition();

  function enregistrer() {
    startTransition(() => {
      mettreAJourPieceAction(piece.id, { nom, typeExtrait, surfaceM2: Number(surfaceM2) });
    });
  }

  return (
    <div className="grid grid-cols-4 gap-2 items-center rounded-lg border border-border p-3">
      <Input value={nom} onChange={(e) => setNom(e.target.value)} onBlur={enregistrer} />
      <Input
        value={typeExtrait}
        onChange={(e) => setTypeExtrait(e.target.value)}
        onBlur={enregistrer}
      />
      <Input
        type="number"
        step="0.01"
        value={surfaceM2}
        onChange={(e) => setSurfaceM2(e.target.value)}
        onBlur={enregistrer}
      />
      <span className="text-[13px] text-muted-foreground">
        {ratio !== null ? `${Math.round(ratio * 100)}%` : "—"}
        {isPending && " ..."}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Write the page (server component)**

```tsx
// src/app/banque-plans/[id]/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { obtenirPlanReference, ratioPiece } from "@/lib/banque-plans";
import { PieceEditor } from "@/components/banque-plans/piece-editor";
import { relancerExtractionAction, validerPlanReferenceAction } from "@/app/banque-plans/actions";
import { ArrowLeft } from "lucide-react";

export default async function BanquePlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const idNombre = Number(id);
  const resultat = await obtenirPlanReference(idNombre);
  if (!resultat) notFound();

  const { plan, pieces } = resultat;
  const extractionEchouee = plan.empriseM2 === null;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link
        href="/banque-plans"
        className="mb-6 inline-flex items-center gap-2 text-[17px] text-primary transition-colors hover:underline"
      >
        <ArrowLeft className="size-4" /> Retour
      </Link>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={plan.imageUrl} alt="Plan de référence" className="mb-6 max-h-96 rounded-xl border border-border" />

      {extractionEchouee ? (
        <div className="mb-6 rounded-xl border border-destructive p-4">
          <p className="text-[15px] text-destructive mb-3">Extraction échouée.</p>
          <form action={relancerExtractionAction.bind(null, plan.id, plan.imageUrl)}>
            <button type="submit" className="text-[15px] text-primary hover:underline">
              Réessayer
            </button>
          </form>
        </div>
      ) : (
        <>
          <p className="text-[15px] text-muted-foreground mb-4">
            Emprise {plan.empriseM2} m² — {plan.largeurM}m x {plan.profondeurM}m — {plan.nbNiveaux} niveau(x)
          </p>

          <div className="space-y-2 mb-6">
            {pieces.map((piece) => (
              <PieceEditor key={piece.id} piece={piece} ratio={ratioPiece(piece, plan)} />
            ))}
          </div>

          {plan.statut === "brouillon" && (
            <form action={validerPlanReferenceAction.bind(null, plan.id)}>
              <button
                type="submit"
                className="rounded-md bg-primary px-4 py-2 text-[15px] font-medium text-primary-foreground hover:opacity-90"
              >
                Valider
              </button>
            </form>
          )}
          {plan.statut === "valide" && (
            <p className="text-[15px] font-medium text-foreground">Statut : validé</p>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run lint + typecheck**

Run: `npx eslint "src/app/banque-plans/[id]/page.tsx" src/components/banque-plans/piece-editor.tsx && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/banque-plans/[id]/page.tsx" src/components/banque-plans/piece-editor.tsx
git commit -m "feat: add banque-plans review and validation page"
```

---

### Task 7: Manual end-to-end verification

**Files:** none (verification only, no code changes).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including `extraction-plan.test.ts` and `banque-plans.test.ts`.

- [ ] **Step 2: Start the dev server**

Run: `pnpm dev`

- [ ] **Step 3: Manually verify the flow in a browser**

1. Log in, navigate to `/banque-plans`.
2. Upload a real plan screenshot.
3. Confirm redirect to `/banque-plans/[id]` and that extracted rooms/areas appear (or the "extraction échouée" + retry UI if the model call fails).
4. Edit a room's name/area inline, confirm it persists on reload.
5. Click "Valider", confirm the plan now shows "Statut : validé" and appears with that status on `/banque-plans`.
6. Delete a plan from the list, confirm it disappears and cascade-deletes its pieces.

- [ ] **Step 4: Record result**

No commit for this task — it is a verification gate. If any step fails, fix the underlying task's code, re-run its tests, and re-verify here before considering the plan complete.
