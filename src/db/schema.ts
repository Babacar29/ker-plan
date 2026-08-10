import { pgTable, serial, text, integer, numeric, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const modeBriquesEnum = pgEnum("mode_briques", ["usine", "fabrique"]);
export const standingEnum = pgEnum("standing", ["economique", "moyen", "haut"]);
export const typeToitureEnum = pgEnum("type_toiture", ["dalle_beton", "tole_bac_alu", "tuile"]);
export const typeStructureEnum = pgEnum("type_structure", [
  "parpaing",
  "brique_terre_stabilisee",
  "brique_cuite",
  "beton_banche",
]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Catalogue prix matériaux, éditable dans paramètres. Clé stable référencée par le moteur de coût. */
export const materiaux = pgTable("materiaux", {
  id: serial("id").primaryKey(),
  cle: text("cle").notNull().unique(),
  libelle: text("libelle").notNull(),
  prixUnitaireFcfa: numeric("prix_unitaire_fcfa", { precision: 12, scale: 2 }).notNull(),
  unite: text("unite").notNull(),
});

/** Forfaits main d'œuvre par corps de métier, en FCFA/m² construit. */
export const mainOeuvre = pgTable("main_oeuvre", {
  id: serial("id").primaryKey(),
  corpsMetier: text("corps_metier").notNull().unique(),
  forfaitFcfaM2: numeric("forfait_fcfa_m2", { precision: 12, scale: 2 }).notNull(),
});

/** Ratios de métré approximatif (ex: briques/m² mur, sacs ciment/m³ béton). Ajustables par l'utilisateur. */
export const ratiosConstruction = pgTable("ratios_construction", {
  id: serial("id").primaryKey(),
  cle: text("cle").notNull().unique(),
  libelle: text("libelle").notNull(),
  valeur: numeric("valeur", { precision: 12, scale: 4 }).notNull(),
  unite: text("unite").notNull(),
});

/**
 * Entité centrale : un projet possède son terrain, ses choix de construction,
 * son plan généré et ses réponses au questionnaire. Le coût n'est jamais stocké
 * ici — il est recalculé à la lecture à partir des catalogues ci-dessus pour
 * ne jamais désynchroniser un montant affiché des prix courants.
 */
export const projets = pgTable("projets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),

  surfaceTerrainM2: numeric("surface_terrain_m2", { precision: 10, scale: 2 }).notNull(),
  surfaceBatieM2: numeric("surface_batie_m2", { precision: 10, scale: 2 }).notNull(),

  typeStructure: typeStructureEnum("type_structure").notNull().default("parpaing"),
  nbNiveaux: integer("nb_niveaux").notNull().default(1),
  typeToiture: typeToitureEnum("type_toiture").notNull().default("dalle_beton"),
  standing: standingEnum("standing").notNull().default("moyen"),
  modeBriques: modeBriquesEnum("mode_briques").notNull().default("usine"),

  reponsesQuestionnaire: jsonb("reponses_questionnaire").notNull(),
  planGenere: jsonb("plan_genere"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Materiau = typeof materiaux.$inferSelect;
export type MainOeuvre = typeof mainOeuvre.$inferSelect;
export type RatioConstruction = typeof ratiosConstruction.$inferSelect;
export type Projet = typeof projets.$inferSelect;
export type NouveauProjet = typeof projets.$inferInsert;
export type User = typeof users.$inferSelect;
export type NouvelUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
