import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { chargerCatalogues } from "@/lib/params";
import { ParametresEditor } from "@/components/parametres-editor";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default async function ParametresPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const catalogues = await chargerCatalogues();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
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
      <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">Paramètres</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Ajuste les prix et ratios. Chaque changement se répercute immédiatement sur le devis de tous tes projets.
      </p>
      <ParametresEditor {...catalogues} />
    </div>
  );
}
