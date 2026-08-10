import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listerProjets } from "@/lib/projets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/logo";
import { Plus, Settings, Home as HomeIcon } from "lucide-react";

const LABEL_STRUCTURE: Record<string, string> = {
  parpaing: "Parpaing",
  brique_terre_stabilisee: "Brique terre stabilisée",
  brique_cuite: "Brique cuite",
  beton_banche: "Béton banché",
};

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const projets = await listerProjets(session.user.id);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="flex items-center justify-between gap-4 mb-10">
        <div className="flex flex-col gap-2">
          <Logo />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Tes projets</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            render={
              <Link href="/parametres">
                <Settings className="size-4" />
                Paramètres
              </Link>
            }
          />
          <Button
            render={
              <Link href="/nouveau">
                <Plus className="size-4" />
                Nouveau projet
              </Link>
            }
          />
        </div>
      </header>

      {projets.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <HomeIcon className="size-10 text-muted-foreground" />
            <div>
              <p className="font-semibold text-foreground">Aucun projet pour l&apos;instant</p>
              <p className="text-sm text-muted-foreground">
                Réponds à un questionnaire, on génère le plan et le devis.
              </p>
            </div>
            <Button
              render={
                <Link href="/nouveau">
                  <Plus className="size-4" />
                  Créer mon premier projet
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projets.map((projet) => (
            <Link key={projet.id} href={`/projets/${projet.id}`} className="cursor-pointer">
              <Card className="h-full transition-shadow hover:shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {projet.nom}
                    <Badge variant="secondary">R+{projet.nbNiveaux - 1}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  <p>{Number(projet.surfaceBatieM2)} m² au sol · {LABEL_STRUCTURE[projet.typeStructure]}</p>
                  <p>Terrain {Number(projet.surfaceTerrainM2)} m²</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
