import { db } from "./index";
import { materiaux, mainOeuvre, ratiosConstruction, users } from "./schema";
import { hashMotDePasse } from "../lib/auth";

/**
 * Valeurs de départ approximatives (marché Dakar, 2026). Toutes ajustables
 * ensuite depuis la page Paramètres — le seed ne sert qu'à démarrer avec
 * des ordres de grandeur crédibles plutôt que des champs vides.
 */
async function seed() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refus d'exécuter le seed contre une base de production (NODE_ENV=production).");
    process.exit(1);
  }

  const passwordHash = await hashMotDePasse("motdepasse123");
  const [user] = await db
    .insert(users)
    .values({ email: "test@kerplan.sn", passwordHash })
    .onConflictDoNothing()
    .returning();

  console.log(`Utilisateur de test : test@kerplan.sn / motdepasse123 (id=${user?.id ?? "existant"})`);

  await db.insert(materiaux).values([
    { cle: "ciment_sac_50kg", libelle: "Ciment (sac 50kg)", prixUnitaireFcfa: "4500", unite: "sac" },
    { cle: "fer_a_beton_12", libelle: "Fer à béton Ø12 (barre 12m)", prixUnitaireFcfa: "6500", unite: "barre" },
    { cle: "brique_parpaing_usine", libelle: "Parpaing 15x20x40 (usine)", prixUnitaireFcfa: "300", unite: "unité" },
    { cle: "sable_m3", libelle: "Sable", prixUnitaireFcfa: "12000", unite: "m³" },
    { cle: "gravier_m3", libelle: "Gravier", prixUnitaireFcfa: "15000", unite: "m³" },
    { cle: "tole_bac_alu_feuille", libelle: "Tôle bac alu", prixUnitaireFcfa: "8500", unite: "feuille" },
    { cle: "carrelage_m2_moyen", libelle: "Carrelage (standing moyen)", prixUnitaireFcfa: "6000", unite: "m²" },
    { cle: "peinture_litre", libelle: "Peinture", prixUnitaireFcfa: "3500", unite: "litre" },
    { cle: "brique_fabriquee_sur_site", libelle: "Brique fabriquée sur site (matériaux seuls)", prixUnitaireFcfa: "150", unite: "unité" },
  ]).onConflictDoNothing();

  await db.insert(mainOeuvre).values([
    { corpsMetier: "gros_oeuvre_macon", forfaitFcfaM2: "35000" },
    { corpsMetier: "electricite", forfaitFcfaM2: "8000" },
    { corpsMetier: "plomberie", forfaitFcfaM2: "9000" },
    { corpsMetier: "peinture_finitions", forfaitFcfaM2: "6000" },
    { corpsMetier: "menuiserie", forfaitFcfaM2: "10000" },
    { corpsMetier: "fabrication_briques", forfaitFcfaM2: "4000" },
  ]).onConflictDoNothing();

  await db.insert(ratiosConstruction).values([
    { cle: "briques_par_m2_mur", libelle: "Briques par m² de mur", valeur: "60", unite: "unité/m²" },
    { cle: "sacs_ciment_par_m3_beton", libelle: "Sacs ciment par m³ béton", valeur: "7", unite: "sac/m³" },
    { cle: "hauteur_mur_standard_m", libelle: "Hauteur sous plafond standard", valeur: "3", unite: "m" },
    { cle: "ratio_mur_perimetre_par_m2_batie", libelle: "Mètres linéaires de mur par m² bâti", valeur: "0.9", unite: "ml/m²" },
    { cle: "epaisseur_dalle_m", libelle: "Épaisseur dalle béton", valeur: "0.12", unite: "m" },
    { cle: "litres_peinture_par_m2_mur", libelle: "Litres de peinture par m² de mur", valeur: "0.3", unite: "litre/m²" },
    { cle: "surface_par_feuille_tole_m2", libelle: "Surface couverte par feuille de tôle", valeur: "3", unite: "m²/feuille" },
    { cle: "majoration_sacs_ciment_joints_murs", libelle: "Majoration sacs ciment pour joints de murs", valeur: "0.2", unite: "ratio" },
  ]).onConflictDoNothing();

  console.log("Seed terminé.");
}

seed().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
