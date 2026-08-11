import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { chargerCatalogues } from "@/lib/params";
import { ParametresEditor } from "@/components/parametres-editor";
import { ArrowLeft } from "lucide-react";

export default async function ParametresPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const catalogues = await chargerCatalogues();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-[17px] text-primary transition-colors hover:underline"
      >
        <ArrowLeft className="size-4" /> Retour
      </Link>
      <h1 className="text-[34px] font-semibold tracking-tight text-foreground mb-2">Paramètres</h1>
      <p className="text-[17px] text-muted-foreground mb-8">
        Ajuste les prix et ratios. Chaque changement se répercute immédiatement sur le devis de tous tes projets.
      </p>
      <ParametresEditor {...catalogues} />
    </div>
  );
}
