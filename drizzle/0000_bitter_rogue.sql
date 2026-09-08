CREATE TYPE "public"."mode_briques" AS ENUM('usine', 'fabrique');--> statement-breakpoint
CREATE TYPE "public"."standing" AS ENUM('economique', 'moyen', 'haut');--> statement-breakpoint
CREATE TYPE "public"."statut_plan_reference" AS ENUM('brouillon', 'valide');--> statement-breakpoint
CREATE TYPE "public"."type_structure" AS ENUM('parpaing', 'brique_terre_stabilisee', 'brique_cuite', 'beton_banche');--> statement-breakpoint
CREATE TYPE "public"."type_toiture" AS ENUM('dalle_beton', 'tole_bac_alu', 'tuile');--> statement-breakpoint
CREATE TABLE "main_oeuvre" (
	"id" serial PRIMARY KEY NOT NULL,
	"corps_metier" text NOT NULL,
	"forfait_fcfa_m2" numeric(12, 2) NOT NULL,
	CONSTRAINT "main_oeuvre_corps_metier_unique" UNIQUE("corps_metier")
);
--> statement-breakpoint
CREATE TABLE "materiaux" (
	"id" serial PRIMARY KEY NOT NULL,
	"cle" text NOT NULL,
	"libelle" text NOT NULL,
	"prix_unitaire_fcfa" numeric(12, 2) NOT NULL,
	"unite" text NOT NULL,
	CONSTRAINT "materiaux_cle_unique" UNIQUE("cle")
);
--> statement-breakpoint
CREATE TABLE "plans_reference" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text,
	"image_url" text NOT NULL,
	"emprise_m2" numeric(10, 2),
	"largeur_m" numeric(10, 2),
	"profondeur_m" numeric(10, 2),
	"nb_niveaux" integer DEFAULT 1 NOT NULL,
	"statut" "statut_plan_reference" DEFAULT 'brouillon' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans_reference_pieces" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_reference_id" integer NOT NULL,
	"type_extrait" text NOT NULL,
	"nom" text NOT NULL,
	"surface_m2" numeric(10, 2) NOT NULL,
	"niveau_index" integer DEFAULT 0 NOT NULL,
	"x_m" numeric(10, 2),
	"y_m" numeric(10, 2),
	"largeur_m" numeric(10, 2),
	"profondeur_m" numeric(10, 2)
);
--> statement-breakpoint
CREATE TABLE "projets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"nom" text NOT NULL,
	"surface_terrain_m2" numeric(10, 2) NOT NULL,
	"surface_batie_m2" numeric(10, 2) NOT NULL,
	"type_structure" "type_structure" DEFAULT 'parpaing' NOT NULL,
	"nb_niveaux" integer DEFAULT 1 NOT NULL,
	"type_toiture" "type_toiture" DEFAULT 'dalle_beton' NOT NULL,
	"standing" "standing" DEFAULT 'moyen' NOT NULL,
	"mode_briques" "mode_briques" DEFAULT 'usine' NOT NULL,
	"plan_reference_id" integer,
	"reponses_questionnaire" jsonb NOT NULL,
	"plan_genere" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratios_construction" (
	"id" serial PRIMARY KEY NOT NULL,
	"cle" text NOT NULL,
	"libelle" text NOT NULL,
	"valeur" numeric(12, 4) NOT NULL,
	"unite" text NOT NULL,
	CONSTRAINT "ratios_construction_cle_unique" UNIQUE("cle")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "plans_reference_pieces" ADD CONSTRAINT "plans_reference_pieces_plan_reference_id_plans_reference_id_fk" FOREIGN KEY ("plan_reference_id") REFERENCES "public"."plans_reference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projets" ADD CONSTRAINT "projets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projets" ADD CONSTRAINT "projets_plan_reference_id_plans_reference_id_fk" FOREIGN KEY ("plan_reference_id") REFERENCES "public"."plans_reference"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;