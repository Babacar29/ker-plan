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
