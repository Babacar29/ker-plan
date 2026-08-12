"use client";

import Link from "next/link";
import { useTransition } from "react";
import { supprimerProjetAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Pencil, Trash2 } from "lucide-react";

export function ProjetActions({ projetId, projetNom }: { projetId: number; projetNom: string }) {
  const [enCours, demarrerTransition] = useTransition();

  function confirmerSuppression() {
    demarrerTransition(() => {
      supprimerProjetAction(projetId);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={
          <Link href={`/projets/${projetId}/modifier`}>
            <Pencil className="size-4" />
            Modifier
          </Link>
        }
      />
      <Dialog>
        <DialogTrigger render={<Button variant="outline" size="sm" className="text-destructive hover:text-destructive" />}>
          <Trash2 className="size-4" />
          Supprimer
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer « {projetNom} » ?</DialogTitle>
            <DialogDescription>
              Cette action est définitive. Le plan et l&apos;estimation de ce projet seront perdus.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Annuler</DialogClose>
            <Button variant="destructive" onClick={confirmerSuppression} disabled={enCours}>
              {enCours ? "Suppression…" : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
