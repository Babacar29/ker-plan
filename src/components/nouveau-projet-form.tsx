"use client";

import { useState, useTransition } from "react";
import { creerProjetAction, modifierProjetAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NouveauProjet, Projet } from "@/db/schema";

type Etat = {
  nom: string;
  surfaceTerrainM2: string;
  surfaceBatieM2: string;
  nbChambres: string;
  nbNiveaux: string;
  nbChambresAvecToiletteInterne: string;
  toilettesVisiteurs: boolean;
  nbCouleurs: string;
  typeStructure: NouveauProjet["typeStructure"];
  typeToiture: NouveauProjet["typeToiture"];
  standing: NouveauProjet["standing"];
  modeBriques: NouveauProjet["modeBriques"];
};

const ETAT_INITIAL: Etat = {
  nom: "",
  surfaceTerrainM2: "",
  surfaceBatieM2: "",
  nbChambres: "3",
  nbNiveaux: "1",
  nbChambresAvecToiletteInterne: "0",
  toilettesVisiteurs: true,
  nbCouleurs: "1",
  typeStructure: "parpaing",
  typeToiture: "dalle_beton",
  standing: "moyen",
  modeBriques: "usine",
};

function etatDepuisProjet(projet: Projet): Etat {
  const reponses = projet.reponsesQuestionnaire as {
    nbChambres: number;
    nbChambresAvecToiletteInterne: number;
    toilettesVisiteurs: boolean;
    nbCouleurs: number;
  };
  return {
    nom: projet.nom,
    surfaceTerrainM2: String(projet.surfaceTerrainM2),
    surfaceBatieM2: String(projet.surfaceBatieM2),
    nbChambres: String(reponses.nbChambres),
    nbNiveaux: String(projet.nbNiveaux),
    nbChambresAvecToiletteInterne: String(reponses.nbChambresAvecToiletteInterne),
    toilettesVisiteurs: reponses.toilettesVisiteurs,
    nbCouleurs: String(reponses.nbCouleurs),
    typeStructure: projet.typeStructure,
    typeToiture: projet.typeToiture,
    standing: projet.standing,
    modeBriques: projet.modeBriques,
  };
}

export function NouveauProjetForm({ projetExistant }: { projetExistant?: Projet }) {
  const [etat, setEtat] = useState<Etat>(
    projetExistant ? etatDepuisProjet(projetExistant) : ETAT_INITIAL
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrerTransition] = useTransition();

  function majChamp<K extends keyof Etat>(champ: K, valeur: Etat[K]) {
    setEtat((precedent) => ({ ...precedent, [champ]: valeur }));
  }

  function soumettre() {
    const surfaceTerrainM2 = Number(etat.surfaceTerrainM2);
    const surfaceBatieM2 = Number(etat.surfaceBatieM2);
    const nbChambres = Number(etat.nbChambres);
    const nbNiveaux = Number(etat.nbNiveaux);
    const nbChambresAvecToiletteInterne = Number(etat.nbChambresAvecToiletteInterne);
    const nbCouleurs = Number(etat.nbCouleurs);

    if (!etat.nom.trim()) return setErreur("Donne un nom à ton projet.");
    if (!(surfaceTerrainM2 > 0)) return setErreur("Surface du terrain invalide.");
    if (!(surfaceBatieM2 > 0)) return setErreur("Surface à bâtir invalide.");
    if (surfaceBatieM2 > surfaceTerrainM2) return setErreur("La surface à bâtir dépasse la surface du terrain.");
    if (!(nbChambres > 0)) return setErreur("Nombre de chambres invalide.");
    if (!(nbNiveaux > 0)) return setErreur("Nombre de niveaux invalide.");
    if (nbChambresAvecToiletteInterne < 0 || nbChambresAvecToiletteInterne > nbChambres) {
      return setErreur("Nombre de chambres avec toilette interne invalide.");
    }
    if (!(nbCouleurs > 0)) return setErreur("Nombre de couleurs invalide.");

    setErreur(null);
    const input = {
      nom: etat.nom.trim(),
      surfaceTerrainM2,
      surfaceBatieM2,
      typeStructure: etat.typeStructure,
      nbNiveaux,
      typeToiture: etat.typeToiture,
      standing: etat.standing,
      modeBriques: etat.modeBriques,
      reponsesQuestionnaire: {
        nbChambres,
        salonOuvertSurCuisine: false,
        nbChambresAvecToiletteInterne,
        toilettesVisiteurs: etat.toilettesVisiteurs,
        nbCouleurs,
      },
    };
    demarrerTransition(() => {
      if (projetExistant) {
        modifierProjetAction(projetExistant.id, input);
      } else {
        creerProjetAction(input);
      }
    });
  }

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{projetExistant ? "Modifier le projet" : "Nouveau projet"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="nom">Nom du projet</Label>
          <Input
            id="nom"
            placeholder="Ma maison à Thiès"
            value={etat.nom}
            onChange={(e) => majChamp("nom", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="terrain">Surface totale du terrain (m²)</Label>
            <Input
              id="terrain"
              type="number"
              min={1}
              value={etat.surfaceTerrainM2}
              onChange={(e) => majChamp("surfaceTerrainM2", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="batie">Surface au sol à bâtir (m²)</Label>
            <Input
              id="batie"
              type="number"
              min={1}
              value={etat.surfaceBatieM2}
              onChange={(e) => majChamp("surfaceBatieM2", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="chambres">Nombre de chambres</Label>
            <Input
              id="chambres"
              type="number"
              min={1}
              value={etat.nbChambres}
              onChange={(e) => majChamp("nbChambres", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="niveaux">Nombre de niveaux (1 = RDC seul)</Label>
            <Input
              id="niveaux"
              type="number"
              min={1}
              max={4}
              value={etat.nbNiveaux}
              onChange={(e) => majChamp("nbNiveaux", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="toilettesInternes">Chambres avec toilette interne</Label>
            <Input
              id="toilettesInternes"
              type="number"
              min={0}
              max={Number(etat.nbChambres) || undefined}
              value={etat.nbChambresAvecToiletteInterne}
              onChange={(e) => majChamp("nbChambresAvecToiletteInterne", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Toilettes pour les visiteurs</Label>
            <Select
              value={etat.toilettesVisiteurs ? "oui" : "non"}
              onValueChange={(v) => majChamp("toilettesVisiteurs", v === "oui")}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="oui">Oui</SelectItem>
                <SelectItem value="non">Non</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="couleurs">Nombre de couloir</Label>
            <Input
              id="couleurs"
              type="number"
              min={1}
              value={etat.nbCouleurs}
              onChange={(e) => majChamp("nbCouleurs", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Type de structure</Label>
            <Select value={etat.typeStructure} onValueChange={(v) => majChamp("typeStructure", v as Etat["typeStructure"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="parpaing">Parpaing</SelectItem>
                <SelectItem value="brique_terre_stabilisee">Brique terre stabilisée</SelectItem>
                <SelectItem value="brique_cuite">Brique cuite</SelectItem>
                <SelectItem value="beton_banche">Béton banché</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Type de toiture</Label>
            <Select value={etat.typeToiture} onValueChange={(v) => majChamp("typeToiture", v as Etat["typeToiture"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dalle_beton">Dalle béton</SelectItem>
                <SelectItem value="tole_bac_alu">Tôle bac alu</SelectItem>
                <SelectItem value="tuile">Tuile</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Standing des finitions</Label>
            <Select value={etat.standing} onValueChange={(v) => majChamp("standing", v as Etat["standing"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="economique">Économique</SelectItem>
                <SelectItem value="moyen">Moyen</SelectItem>
                <SelectItem value="haut">Haut standing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Briques</Label>
            <Select value={etat.modeBriques} onValueChange={(v) => majChamp("modeBriques", v as Etat["modeBriques"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="usine">Achetées à l&apos;usine</SelectItem>
                <SelectItem value="fabrique">Fabriquées sur site</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {erreur && <p className="text-sm text-destructive">{erreur}</p>}

        <Button className="w-full" onClick={soumettre} disabled={enCours}>
          {enCours
            ? "Génération du plan…"
            : projetExistant
              ? "Enregistrer les modifications"
              : "Générer mon plan et mon devis"}
        </Button>
      </CardContent>
    </Card>
  );
}
