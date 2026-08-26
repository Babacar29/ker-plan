import { generateText, Output } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
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

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
const MODELE_VISION = google("gemini-3.6-flash");

const PROMPT_EXTRACTION = `Tu es un architecte qui lit un plan de maison réel (capture d'écran ou photo).
Extrais les informations suivantes en respectant les conventions observées sur ce type de plan :
- la surface totale de l'emprise au sol en m² (souvent affichée dans un encadré bleu)
- la largeur et la profondeur de l'emprise en mètres (déduites des cotes en cm le long des bords, converties en mètres)
- le nombre de niveaux (RDC seul = 1, RDC + étage = 2, etc.)
- la liste des pièces avec leur nom tel qu'affiché (ex: "SDB", "CH1", "cour de service", "espace familial"), un type extrait normalisé en minuscules (ex: "chambre", "salon", "cuisine", "sdb", "wc", "circulation", "cour", "patio", "garage", ou un autre libellé court si aucun type standard ne correspond), et leur surface en m².
Si une valeur n'est pas lisible sur le plan, fais la meilleure estimation possible à partir des cotes visibles plutôt que de l'omettre.`;

export async function extraireDonneesPlan(imageUrl: string): Promise<ExtractionPlan> {
  const { output } = (await generateText({
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
  })) as { output: unknown };

  return SchemaExtractionPlan.parse(output);
}
