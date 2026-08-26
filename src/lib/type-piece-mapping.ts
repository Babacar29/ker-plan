import type { TypePiece } from "./plan-generator";

/** Table de correspondance pure, sans dépendance DB — importable côté
 * client et côté serveur. */
const CORRESPONDANCE_TYPE_EXTRAIT: Record<string, TypePiece> = {
  salon: "salon",
  cuisine: "cuisine",
  chambre: "chambre",
  wc: "wc",
  circulation: "circulation",
  sdb: "sdb",
};

/** Mappe un libellé de type brut extrait d'un plan vers un TypePiece du
 * générateur. Retourne null pour tout libellé sans correspondance connue
 * (ex: "cour", "patio", "garage"). */
export function mapperTypeExtrait(typeExtrait: string): TypePiece | null {
  return CORRESPONDANCE_TYPE_EXTRAIT[typeExtrait.toLowerCase().trim()] ?? null;
}
