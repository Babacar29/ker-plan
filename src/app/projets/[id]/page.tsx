import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { obtenirProjet } from "@/lib/projets";
import { chargerCatalogues } from "@/lib/params";
import { calculerCout } from "@/lib/cost-engine";
import type { Plan } from "@/lib/plan-generator";
import { Scene3D } from "@/components/plan-3d/scene-3d";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";

function formaterFcfa(montant: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(montant)) + " FCFA";
}

export default async function ProjetPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const projet = await obtenirProjet(Number(id), session.user.id);
  if (!projet || !projet.planGenere) notFound();

  const catalogues = await chargerCatalogues();
  const estimation = calculerCout(projet, catalogues);
  const plan = projet.planGenere as Plan;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <Button
        variant="ghost"
        size="sm"
        className="mb-6 -ml-2"
        render={
          <Link href="/">
            <ArrowLeft className="size-4" /> Retour
          </Link>
        }
      />

      <h1 className="text-3xl font-bold tracking-tight text-foreground mb-8">{projet.nom}</h1>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden p-0">
          <div className="h-[480px] bg-muted">
            <Scene3D plan={plan} />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estimation du coût</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <PosteListe titre="Matériaux" lignes={estimation.postesMateriaux} sousTotal={estimation.totalMateriauxFcfa} />
            <PosteListe titre="Main d'œuvre" lignes={estimation.postesMainOeuvre} sousTotal={estimation.totalMainOeuvreFcfa} />
            <Separator />
            <div className="flex items-center justify-between text-lg font-bold text-foreground">
              <span>Total estimé</span>
              <span>{formaterFcfa(estimation.totalFcfa)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Estimation par ratios, ±15-20%. Ajustable dans Paramètres.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PosteListe({
  titre,
  lignes,
  sousTotal,
}: {
  titre: string;
  lignes: { cle: string; libelle: string; quantite: number; unite: string; totalFcfa: number }[];
  sousTotal: number;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-2">{titre}</h3>
      <div className="space-y-1.5">
        {lignes.map((l) => (
          <div key={l.cle} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {l.libelle} · {l.quantite.toFixed(1)} {l.unite}
            </span>
            <span className="text-foreground">{formaterFcfa(l.totalFcfa)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-sm font-medium mt-2 pt-2 border-t border-border">
        <span>Sous-total</span>
        <span>{formaterFcfa(sousTotal)}</span>
      </div>
    </div>
  );
}
