import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { obtenirProjet } from "@/lib/projets";
import { chargerCatalogues } from "@/lib/params";
import { calculerCout, type LigneCout } from "@/lib/cost-engine";
import type { Plan } from "@/lib/plan-generator";
import { Scene3D } from "@/components/plan-3d/scene-3d";
import { ProjetActions } from "@/components/projet-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Building2, LayoutGrid, Ruler, Boxes, HardHat } from "lucide-react";

function formaterFcfa(montant: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(montant)) + " FCFA";
}

const LIBELLES_STRUCTURE: Record<string, string> = {
  parpaing: "Parpaing",
  brique_terre: "Brique de terre",
  beton_arme: "Béton armé",
};

const LIBELLES_STANDING: Record<string, string> = {
  economique: "Économique",
  moyen: "Standing moyen",
  haut: "Haut standing",
};

export default async function ProjetPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const projet = await obtenirProjet(Number(id), session.user.id);
  if (!projet || !projet.planGenere) notFound();

  const catalogues = await chargerCatalogues();
  const estimation = calculerCout(projet, catalogues);
  const plan = projet.planGenere as Plan;

  const surfaceHabitable = Number(projet.surfaceBatieM2) * projet.nbNiveaux;

  return (
    <div className="min-h-dvh bg-[#f5f5f7]">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-[17px] text-primary transition-colors hover:underline"
        >
          <ArrowLeft className="size-4" /> Retour aux projets
        </Link>

        {/* En-tête */}
        <div className="mb-8 flex flex-col gap-4 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
              Plan généré
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[40px]">{projet.nom}</h1>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Coût total estimé</p>
              <p className="text-2xl font-semibold text-primary sm:text-3xl">{formaterFcfa(estimation.totalFcfa)}</p>
            </div>
            <ProjetActions projetId={projet.id} projetNom={projet.nom} />
          </div>
        </div>

        {/* Stats rapides */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Ruler} label="Surface bâtie" value={`${Number(projet.surfaceBatieM2).toFixed(0)} m²`} />
          <StatCard icon={LayoutGrid} label="Surface habitable" value={`${surfaceHabitable.toFixed(0)} m²`} />
          <StatCard icon={Building2} label="Structure" value={LIBELLES_STRUCTURE[projet.typeStructure] ?? projet.typeStructure} />
          <StatCard icon={HardHat} label="Niveaux" value={`${projet.nbNiveaux} · ${LIBELLES_STANDING[projet.standing] ?? projet.standing}`} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-border bg-card px-5 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Boxes className="size-4 text-primary" />
                Aperçu 3D
              </div>
            </div>
            <div className="h-[480px] bg-card">
              <Scene3D plan={plan} />
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-[17px] font-semibold">Estimation du coût</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <PosteListe
                titre="Matériaux"
                lignes={estimation.postesMateriaux}
                sousTotal={estimation.totalMateriauxFcfa}
                totalFcfa={estimation.totalFcfa}
                accentClassName="bg-primary"
              />
              <PosteListe
                titre="Main d'œuvre"
                lignes={estimation.postesMainOeuvre}
                sousTotal={estimation.totalMainOeuvreFcfa}
                totalFcfa={estimation.totalFcfa}
                accentClassName="bg-primary/60"
              />
              <Separator />
              <div className="flex items-center justify-between rounded-lg bg-primary/5 px-4 py-3 text-lg font-bold text-foreground">
                <span>Total estimé</span>
                <span className="text-primary">{formaterFcfa(estimation.totalFcfa)}</span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Estimation par ratios, ±15-20%. Ajustable dans{" "}
                <Link href="/parametres" className="font-medium text-primary underline-offset-2 hover:underline">
                  Paramètres
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[18px] border border-border bg-card px-4 py-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function PosteListe({
  titre,
  lignes,
  sousTotal,
  totalFcfa,
  accentClassName,
}: {
  titre: string;
  lignes: LigneCout[];
  sousTotal: number;
  totalFcfa: number;
  accentClassName: string;
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{titre}</h3>
        <span className="text-xs font-medium text-muted-foreground">
          {totalFcfa > 0 ? Math.round((sousTotal / totalFcfa) * 100) : 0}% du total
        </span>
      </div>
      <div className="space-y-3">
        {lignes.map((l) => {
          const part = sousTotal > 0 ? (l.totalFcfa / sousTotal) * 100 : 0;
          return (
            <div key={l.cle}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {l.libelle} <span className="text-xs">· {l.quantite.toFixed(1)} {l.unite}</span>
                </span>
                <span className="font-medium text-foreground">{formaterFcfa(l.totalFcfa)}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${accentClassName}`} style={{ width: `${Math.min(100, part)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-sm font-medium">
        <span>Sous-total</span>
        <span>{formaterFcfa(sousTotal)}</span>
      </div>
    </div>
  );
}
