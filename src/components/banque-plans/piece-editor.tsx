"use client";

import { useState, useTransition } from "react";
import { mettreAJourPieceAction } from "@/app/banque-plans/actions";
import { Input } from "@/components/ui/input";
import type { PlanReferencePiece } from "@/db/schema";

type Props = {
  piece: PlanReferencePiece;
  ratio: number | null;
};

export function PieceEditor({ piece, ratio }: Props) {
  const [nom, setNom] = useState(piece.nom);
  const [typeExtrait, setTypeExtrait] = useState(piece.typeExtrait);
  const [surfaceM2, setSurfaceM2] = useState(String(piece.surfaceM2));
  const [isPending, startTransition] = useTransition();

  function enregistrer() {
    startTransition(() => {
      mettreAJourPieceAction(piece.id, { nom, typeExtrait, surfaceM2: Number(surfaceM2) });
    });
  }

  return (
    <div className="grid grid-cols-4 gap-2 items-center rounded-lg border border-border p-3">
      <Input value={nom} onChange={(e) => setNom(e.target.value)} onBlur={enregistrer} />
      <Input
        value={typeExtrait}
        onChange={(e) => setTypeExtrait(e.target.value)}
        onBlur={enregistrer}
      />
      <Input
        type="number"
        step="0.01"
        value={surfaceM2}
        onChange={(e) => setSurfaceM2(e.target.value)}
        onBlur={enregistrer}
      />
      <span className="text-[13px] text-muted-foreground">
        {ratio !== null ? `${Math.round(ratio * 100)}%` : "—"}
        {isPending && " ..."}
      </span>
    </div>
  );
}
