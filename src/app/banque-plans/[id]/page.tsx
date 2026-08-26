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
