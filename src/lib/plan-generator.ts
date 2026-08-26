import { layoutRects, type Rect } from "./layout/squarified-treemap";

export type TypePiece =
  | "salon"
  | "cuisine"
  | "chambre"
  | "wc"
  | "circulation"
  | "sdb";

export type Piece = {
  id: string;
  type: TypePiece;
  nom: string;
  rect: Rect;
};

export type Ouverture = {
  type: "porte" | "fenetre";
  /** Segment mural en coordonnées absolues du niveau (mètres). */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type Niveau = {
  index: number;
  largeurM: number;
  profondeurM: number;
  pieces: Piece[];
  ouvertures: Ouverture[];
};

export type Plan = {
  niveaux: Niveau[];
};

export type ReponsesQuestionnaire = {
  nbChambres: number;
  salonOuvertSurCuisine: boolean;
  nbChambresAvecToiletteInterne: number;
  toilettesVisiteurs: boolean;
  nbCouleurs: number;
};

const RATIO_CIRCULATION_DEFAUT = 0.16;
const ASPECT_RATIO_EMPRISE = 1.3;
const TOLERANCE_ADJACENCE_M = 0.15;
const LONGUEUR_MIN_OUVERTURE_M = 0.8;

const NOMS: Record<TypePiece, string> = {
  salon: "Salon",
  cuisine: "Cuisine",
  chambre: "Chambre",
  wc: "WC",
  circulation: "Circulation",
  sdb: "Salle de bain",
};

/**
 * Génère un plan à partir des réponses au questionnaire et des dimensions
 * de l'emprise bâtie. Chaque niveau reçoit une liste de pièces pondérées
 * par surface cible, positionnées par un treemap squarifié, puis on dérive
 * portes (entre pièces adjacentes) et fenêtres (sur murs en périphérie).
 */
export function genererPlan(
  reponses: ReponsesQuestionnaire,
  surfaceEmpriseM2: number,
  nbNiveaux: number,
  ratioCirculation: number = RATIO_CIRCULATION_DEFAUT,
  ratios: Partial<Record<TypePiece, number>> = {}
): Plan {
  const surfaceParNiveau = surfaceEmpriseM2;
  const largeurM = Math.sqrt(surfaceParNiveau * ASPECT_RATIO_EMPRISE);
  const profondeurM = surfaceParNiveau / largeurM;

  const chambresParNiveau = repartirChambres(reponses.nbChambres, nbNiveaux);
  const chambresToiletteInterneParNiveau = repartirChambres(
    Math.min(reponses.nbChambresAvecToiletteInterne, reponses.nbChambres),
    nbNiveaux
  );

  const niveaux: Niveau[] = [];
  for (let index = 0; index < nbNiveaux; index++) {
    const container: Rect = { x: 0, y: 0, width: largeurM, height: profondeurM };
    const items = piecesDuNiveau(
      index,
      chambresParNiveau[index],
      chambresToiletteInterneParNiveau[index],
      reponses.toilettesVisiteurs,
      surfaceParNiveau,
      ratioCirculation,
      ratios
    );
    const rects = layoutRects(
      items.map((it) => ({ id: it.id, weight: it.surfaceCibleM2 })),
      container
    );

    const pieces: Piece[] = items.map((it) => ({
      id: it.id,
      type: it.type,
      nom: it.nom,
      rect: rects.get(it.id)!,
    }));

    niveaux.push({
      index,
      largeurM,
      profondeurM,
      pieces,
      ouvertures: [
        ...genererPortes(pieces),
        ...genererFenetres(pieces, largeurM, profondeurM),
      ],
    });
  }

  return { niveaux };
}

function repartirChambres(nbChambres: number, nbNiveaux: number): number[] {
  const base = Math.floor(nbChambres / nbNiveaux);
  const reste = nbChambres % nbNiveaux;
  return Array.from({ length: nbNiveaux }, (_, i) => base + (i < reste ? 1 : 0));
}

function piecesDuNiveau(
  niveauIndex: number,
  nbChambres: number,
  nbChambresAvecToiletteInterne: number,
  toilettesVisiteurs: boolean,
  surfaceParNiveau: number,
  ratioCirculation: number,
  ratios: Partial<Record<TypePiece, number>>
): { id: string; type: TypePiece; nom: string; surfaceCibleM2: number }[] {
  const pieces: { id: string; type: TypePiece; nom: string; surfaceCibleM2: number }[] = [];

  // Ratios calés sur les plans SNHLM Bambilor (F3 Moda/Mariama/Diariétou) :
  // salon plus modeste, cuisine plus compacte, circulation/espace familial
  // généreux, WC visiteurs réduit — la chambre parents récupère la surface
  // économisée sous forme de salle de bain privative systématique.
  // Circulation ajustable depuis Paramètres (ratio_circulation_par_m2_batie).
  const RATIO_SALON = ratios.salon ?? 0.22;
  const RATIO_CUISINE = ratios.cuisine ?? 0.1;
  const RATIO_CIRCULATION = ratios.circulation ?? ratioCirculation;
  const RATIO_WC_VISITEURS = ratios.wc ?? 0.03;
  const RATIO_SDB_PARENTS = ratios.sdb ?? 0.04;
  const RATIO_SDB_SECONDAIRE = ratios.sdb ?? 0.035;

  let surfaceFixeRatio = 0;
  if (niveauIndex === 0) {
    pieces.push({ id: "salon", type: "salon", nom: NOMS.salon, surfaceCibleM2: surfaceParNiveau * RATIO_SALON });
    pieces.push({ id: "cuisine", type: "cuisine", nom: NOMS.cuisine, surfaceCibleM2: surfaceParNiveau * RATIO_CUISINE });
    pieces.push({ id: "circulation", type: "circulation", nom: NOMS.circulation, surfaceCibleM2: surfaceParNiveau * RATIO_CIRCULATION });
    surfaceFixeRatio = RATIO_SALON + RATIO_CUISINE + RATIO_CIRCULATION;
    if (toilettesVisiteurs) {
      pieces.push({ id: "wc-visiteurs", type: "wc", nom: "WC visiteurs", surfaceCibleM2: surfaceParNiveau * RATIO_WC_VISITEURS });
      surfaceFixeRatio += RATIO_WC_VISITEURS;
    }
  } else {
    pieces.push({ id: `circulation-${niveauIndex}`, type: "circulation", nom: NOMS.circulation, surfaceCibleM2: surfaceParNiveau * RATIO_CIRCULATION });
    surfaceFixeRatio = RATIO_CIRCULATION;
  }

  // La chambre parents (niveau 0, première chambre) a toujours sa propre
  // salle de bain, comme sur tous les plans SNHLM — indépendamment du
  // nombre de toilettes internes demandé pour les autres chambres.
  const aChambreParents = niveauIndex === 0 && nbChambres > 0;
  const nbToiletteInterneSecondaires = Math.max(
    nbChambresAvecToiletteInterne - (aChambreParents ? 1 : 0),
    0
  );
  surfaceFixeRatio +=
    (aChambreParents ? RATIO_SDB_PARENTS : 0) + nbToiletteInterneSecondaires * RATIO_SDB_SECONDAIRE;

  const surfaceRestante = surfaceParNiveau * (1 - surfaceFixeRatio);
  if (nbChambres > 0) {
    const surfaceParChambre = surfaceRestante / nbChambres;
    for (let i = 0; i < nbChambres; i++) {
      const estChambreParents = aChambreParents && i === 0;
      pieces.push({
        id: `chambre-${niveauIndex}-${i}`,
        type: "chambre",
        nom: estChambreParents
          ? "Chambre parents"
          : nbChambres > 1
            ? `${NOMS.chambre} ${i + 1}`
            : NOMS.chambre,
        surfaceCibleM2: surfaceParChambre,
      });
      if (estChambreParents || i < nbChambresAvecToiletteInterne) {
        pieces.push({
          id: `sdb-${niveauIndex}-${i}`,
          type: "sdb",
          nom: estChambreParents ? "SB Parents" : `SB ${i + 1}`,
          surfaceCibleM2: surfaceParNiveau * (estChambreParents ? RATIO_SDB_PARENTS : RATIO_SDB_SECONDAIRE),
        });
      }
    }
  }

  return pieces;
}

function genererPortes(pieces: Piece[]): Ouverture[] {
  const ouvertures: Ouverture[] = [];
  const circulation = pieces.find((p) => p.type === "circulation" || p.type === "salon");
  if (!circulation) return ouvertures;

  for (const piece of pieces) {
    if (piece.id === circulation.id) continue;
    const segment = segmentPartage(circulation.rect, piece.rect);
    if (segment && longueurSegment(segment) >= LONGUEUR_MIN_OUVERTURE_M) {
      ouvertures.push({ type: "porte", ...centrerSegment(segment, 1) });
    }
  }
  return ouvertures;
}

function genererFenetres(pieces: Piece[], largeurNiveau: number, profondeurNiveau: number): Ouverture[] {
  const ouvertures: Ouverture[] = [];
  for (const piece of pieces) {
    if (piece.type === "circulation") continue;
    const { rect } = piece;
    const surLeBordGauche = Math.abs(rect.x) < TOLERANCE_ADJACENCE_M;
    const surLeBordDroit = Math.abs(rect.x + rect.width - largeurNiveau) < TOLERANCE_ADJACENCE_M;
    const surLeBordHaut = Math.abs(rect.y) < TOLERANCE_ADJACENCE_M;
    const surLeBordBas = Math.abs(rect.y + rect.height - profondeurNiveau) < TOLERANCE_ADJACENCE_M;

    if (surLeBordGauche) {
      ouvertures.push({ type: "fenetre", ...centrerSegment({ x1: rect.x, y1: rect.y, x2: rect.x, y2: rect.y + rect.height }, 1.2) });
    } else if (surLeBordDroit) {
      const xEdge = rect.x + rect.width;
      ouvertures.push({ type: "fenetre", ...centrerSegment({ x1: xEdge, y1: rect.y, x2: xEdge, y2: rect.y + rect.height }, 1.2) });
    } else if (surLeBordHaut) {
      ouvertures.push({ type: "fenetre", ...centrerSegment({ x1: rect.x, y1: rect.y, x2: rect.x + rect.width, y2: rect.y }, 1.2) });
    } else if (surLeBordBas) {
      const yEdge = rect.y + rect.height;
      ouvertures.push({ type: "fenetre", ...centrerSegment({ x1: rect.x, y1: yEdge, x2: rect.x + rect.width, y2: yEdge }, 1.2) });
    }
  }
  return ouvertures;
}

function segmentPartage(a: Rect, b: Rect): { x1: number; y1: number; x2: number; y2: number } | null {
  const verticalement =
    Math.abs(a.x + a.width - b.x) < TOLERANCE_ADJACENCE_M || Math.abs(b.x + b.width - a.x) < TOLERANCE_ADJACENCE_M;
  const horizontalement =
    Math.abs(a.y + a.height - b.y) < TOLERANCE_ADJACENCE_M || Math.abs(b.y + b.height - a.y) < TOLERANCE_ADJACENCE_M;

  if (verticalement) {
    const yStart = Math.max(a.y, b.y);
    const yEnd = Math.min(a.y + a.height, b.y + b.height);
    if (yEnd - yStart < LONGUEUR_MIN_OUVERTURE_M) return null;
    const x = Math.abs(a.x + a.width - b.x) < TOLERANCE_ADJACENCE_M ? a.x + a.width : b.x + b.width;
    return { x1: x, y1: yStart, x2: x, y2: yEnd };
  }
  if (horizontalement) {
    const xStart = Math.max(a.x, b.x);
    const xEnd = Math.min(a.x + a.width, b.x + b.width);
    if (xEnd - xStart < LONGUEUR_MIN_OUVERTURE_M) return null;
    const y = Math.abs(a.y + a.height - b.y) < TOLERANCE_ADJACENCE_M ? a.y + a.height : b.y + b.height;
    return { x1: xStart, y1: y, x2: xEnd, y2: y };
  }
  return null;
}

function longueurSegment(s: { x1: number; y1: number; x2: number; y2: number }): number {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
}

function centrerSegment(s: { x1: number; y1: number; x2: number; y2: number }, largeurOuverture: number) {
  const longueur = longueurSegment(s);
  const marge = Math.max(0, (longueur - largeurOuverture) / 2);
  const t1 = marge / longueur;
  const t2 = 1 - t1;
  return {
    x1: s.x1 + (s.x2 - s.x1) * t1,
    y1: s.y1 + (s.y2 - s.y1) * t1,
    x2: s.x1 + (s.x2 - s.x1) * t2,
    y2: s.y1 + (s.y2 - s.y1) * t2,
  };
}
