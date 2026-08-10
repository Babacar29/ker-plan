import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { NouveauProjetForm } from "@/components/nouveau-projet-form";

export default async function NouveauProjetPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Retour aux projets
      </Link>
      <NouveauProjetForm />
    </div>
  );
}
