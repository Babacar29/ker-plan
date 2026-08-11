"use client";

import { useState, useTransition } from "react";
import {
  mettreAJourPrixMateriauAction,
  mettreAJourForfaitMainOeuvreAction,
  mettreAJourRatioAction,
} from "@/app/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Materiau, MainOeuvre, RatioConstruction } from "@/db/schema";

type Props = {
  materiaux: Materiau[];
  mainOeuvre: MainOeuvre[];
  ratios: RatioConstruction[];
};

export function ParametresEditor({ materiaux, mainOeuvre, ratios }: Props) {
  return (
    <div className="space-y-6">
      <Section titre="Prix des matériaux (FCFA)">
        {materiaux.map((m) => (
          <LigneEditable
            key={m.id}
            libelle={`${m.libelle} (${m.unite})`}
            valeurInitiale={Number(m.prixUnitaireFcfa)}
            onEnregistrer={(v) => mettreAJourPrixMateriauAction(m.id, v)}
          />
        ))}
      </Section>

      <Section titre="Main d'œuvre — forfaits FCFA/m²">
        {mainOeuvre.map((m) => (
          <LigneEditable
            key={m.id}
            libelle={m.corpsMetier}
            valeurInitiale={Number(m.forfaitFcfaM2)}
            onEnregistrer={(v) => mettreAJourForfaitMainOeuvreAction(m.id, v)}
          />
        ))}
      </Section>

      <Section titre="Ratios de métré">
        {ratios.map((r) => (
          <LigneEditable
            key={r.id}
            libelle={`${r.libelle} (${r.unite})`}
            valeurInitiale={Number(r.valeur)}
            onEnregistrer={(v) => mettreAJourRatioAction(r.id, v)}
          />
        ))}
      </Section>
    </div>
  );
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{titre}</CardTitle></CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function LigneEditable({
  libelle,
  valeurInitiale,
  onEnregistrer,
}: {
  libelle: string;
  valeurInitiale: number;
  onEnregistrer: (valeur: number) => Promise<void>;
}) {
  const [valeur, setValeur] = useState(String(valeurInitiale));
  const [enCours, demarrerTransition] = useTransition();
  const modifie = Number(valeur) !== valeurInitiale;

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground capitalize">{libelle.replaceAll("_", " ")}</span>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          className="w-32"
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
        />
        <Button
          size="sm"
          variant={modifie ? "default" : "outline"}
          disabled={!modifie || enCours}
          onClick={() => demarrerTransition(() => onEnregistrer(Number(valeur)))}
        >
          {enCours ? "…" : "OK"}
        </Button>
      </div>
    </div>
  );
}
