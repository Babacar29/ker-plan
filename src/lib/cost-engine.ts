import type { Materiau, MainOeuvre, RatioConstruction, Projet } from "@/db/schema";

export type LigneCout = {
  cle: string;
  libelle: string;
  quantite: number;
  unite: string;
  prixUnitaireFcfa: number;
  totalFcfa: number;
};

export type EstimationCout = {
  postesMateriaux: LigneCout[];
  postesMainOeuvre: LigneCout[];
  totalMateriauxFcfa: number;
  totalMainOeuvreFcfa: number;
  totalFcfa: number;
};

type Catalogues = {
  materiaux: Materiau[];
  mainOeuvre: MainOeuvre[];
  ratios: RatioConstruction[];
};

/**
 * Calcule un métré approximatif (ratios ajustables, pas de plan détaillé
 * pièce par pièce) puis applique les prix courants des catalogues. Ne lit
 * jamais un coût stocké : toujours recalculé à partir des paramètres actuels
 * pour qu'un changement de prix se répercute instantanément sur tous les projets.
 */
export function calculerCout(projet: Projet, catalogues: Catalogues): EstimationCout {
  const prix = indexer(catalogues.materiaux, (m) => m.cle, (m) => Number(m.prixUnitaireFcfa));
  const ratio = indexer(catalogues.ratios, (r) => r.cle, (r) => Number(r.valeur));
  const libelleMateriau = indexer(catalogues.materiaux, (m) => m.cle, (m) => m.libelle);
  const uniteMateriau = indexer(catalogues.materiaux, (m) => m.cle, (m) => m.unite);

  const surfaceEmpriseM2 = Number(projet.surfaceBatieM2);
  const nbNiveaux = projet.nbNiveaux;
  const surfaceHabitableTotaleM2 = surfaceEmpriseM2 * nbNiveaux;

  const hauteurMurM = ratio("hauteur_mur_standard_m") ?? 3;
  const mlMurParM2 = ratio("ratio_mur_perimetre_par_m2_batie") ?? 0.9;
  const surfaceMurTotaleM2 = mlMurParM2 * surfaceEmpriseM2 * nbNiveaux * hauteurMurM;

  const epaisseurDalleM = ratio("epaisseur_dalle_m") ?? 0.12;
  const nbDalles = nbNiveaux + (projet.typeToiture === "dalle_beton" ? 1 : 0);
  const volumeBetonM3 = surfaceEmpriseM2 * epaisseurDalleM * nbDalles;

  const briquesParM2Mur = ratio("briques_par_m2_mur") ?? 60;
  const nbBriques = surfaceMurTotaleM2 * briquesParM2Mur;

  const sacsCimentBase = volumeBetonM3 * (ratio("sacs_ciment_par_m3_beton") ?? 7);
  const majorationJoints = ratio("majoration_sacs_ciment_joints_murs") ?? 0.2;
  const sacsCiment = sacsCimentBase * (1 + majorationJoints);

  const litresPeinture = surfaceMurTotaleM2 * (ratio("litres_peinture_par_m2_mur") ?? 0.3);
  const surfaceCarrelageM2 = surfaceHabitableTotaleM2;

  const postesMateriaux: LigneCout[] = [];

  postesMateriaux.push(
    ligne("ciment_sac_50kg", libelleMateriau, uniteMateriau, prix, sacsCiment)
  );

  if (projet.modeBriques === "usine") {
    postesMateriaux.push(ligne("brique_parpaing_usine", libelleMateriau, uniteMateriau, prix, nbBriques));
  } else {
    postesMateriaux.push(ligne("brique_fabriquee_sur_site", libelleMateriau, uniteMateriau, prix, nbBriques));
  }

  postesMateriaux.push(ligne("sable_m3", libelleMateriau, uniteMateriau, prix, volumeBetonM3 * 0.5));
  postesMateriaux.push(ligne("gravier_m3", libelleMateriau, uniteMateriau, prix, volumeBetonM3 * 0.8));
  postesMateriaux.push(ligne("carrelage_m2_moyen", libelleMateriau, uniteMateriau, prix, surfaceCarrelageM2));
  postesMateriaux.push(ligne("peinture_litre", libelleMateriau, uniteMateriau, prix, litresPeinture));

  if (projet.typeToiture === "tole_bac_alu") {
    const surfaceParFeuille = ratio("surface_par_feuille_tole_m2") ?? 3;
    postesMateriaux.push(ligne("tole_bac_alu_feuille", libelleMateriau, uniteMateriau, prix, surfaceEmpriseM2 / surfaceParFeuille));
  }

  const postesMainOeuvre: LigneCout[] = catalogues.mainOeuvre
    .filter((m) => m.corpsMetier !== "fabrication_briques" || projet.modeBriques === "fabrique")
    .map((m) => {
      const surfaceApplicable = m.corpsMetier === "fabrication_briques" ? surfaceMurTotaleM2 : surfaceHabitableTotaleM2;
      const total = Number(m.forfaitFcfaM2) * surfaceApplicable;
      return {
        cle: m.corpsMetier,
        libelle: libelleCorpsMetier(m.corpsMetier),
        quantite: surfaceApplicable,
        unite: "m²",
        prixUnitaireFcfa: Number(m.forfaitFcfaM2),
        totalFcfa: total,
      };
    });

  const totalMateriauxFcfa = postesMateriaux.reduce((s, l) => s + l.totalFcfa, 0);
  const totalMainOeuvreFcfa = postesMainOeuvre.reduce((s, l) => s + l.totalFcfa, 0);

  return {
    postesMateriaux,
    postesMainOeuvre,
    totalMateriauxFcfa,
    totalMainOeuvreFcfa,
    totalFcfa: totalMateriauxFcfa + totalMainOeuvreFcfa,
  };
}

function indexer<T, V>(items: T[], key: (t: T) => string, value: (t: T) => V): (cle: string) => V | undefined {
  const map = new Map(items.map((i) => [key(i), value(i)]));
  return (cle: string) => map.get(cle);
}

function ligne(
  cle: string,
  libelleMateriau: (cle: string) => string | undefined,
  uniteMateriau: (cle: string) => string | undefined,
  prix: (cle: string) => number | undefined,
  quantite: number
): LigneCout {
  const prixUnitaire = prix(cle) ?? 0;
  return {
    cle,
    libelle: libelleMateriau(cle) ?? cle,
    quantite,
    unite: uniteMateriau(cle) ?? "",
    prixUnitaireFcfa: prixUnitaire,
    totalFcfa: prixUnitaire * quantite,
  };
}

function libelleCorpsMetier(corpsMetier: string): string {
  const noms: Record<string, string> = {
    gros_oeuvre_macon: "Gros œuvre (maçon)",
    electricite: "Électricité",
    plomberie: "Plomberie",
    peinture_finitions: "Peinture & finitions",
    menuiserie: "Menuiserie",
    fabrication_briques: "Main d'œuvre fabrication briques",
  };
  return noms[corpsMetier] ?? corpsMetier;
}
