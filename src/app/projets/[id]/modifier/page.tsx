import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { obtenirProjet } from "@/lib/projets";
import { NouveauProjetForm } from "@/components/nouveau-projet-form";

export default async function ModifierProjetPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const projet = await obtenirProjet(Number(id), session.user.id);
  if (!projet) notFound();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <Link
        href={`/projets/${projet.id}`}
        className="mb-6 inline-flex items-center gap-2 text-[17px] text-primary transition-colors hover:underline"
      >
        <ArrowLeft className="size-4" />
        Retour au projet
      </Link>
      <NouveauProjetForm projetExistant={projet} />
    </div>
  );
}
