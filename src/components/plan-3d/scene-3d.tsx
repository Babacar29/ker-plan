"use client";

import { useEffect, useRef, useState, type ElementRef } from "react";
import { createPortal } from "react-dom";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Text, Edges } from "@react-three/drei";
import * as THREE from "three";
import { ZoomIn, ZoomOut, RotateCcw, RefreshCw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import type { Ouverture as OuvertureData, Plan, TypePiece } from "@/lib/plan-generator";

const PAS_ROTATION_RAD = Math.PI / 24;

const EPAISSEUR_MUR_M = 0.15;
const HAUTEUR_NIVEAU_M = 3;

const COULEUR_PIECE: Record<TypePiece, string> = {
  salon: "#E2E8F0",
  cuisine: "#FDE68A",
  chambre: "#BFDBFE",
  wc: "#D1D5DB",
  circulation: "#E4D8C3",
  sdb: "#A7F3D0",
};

const COULEUR_MUR = "#94A3B8";
const COULEUR_PORTE = "#92400E";
const COULEUR_POIGNEE = "#FDE68A";
const COULEUR_FENETRE = "#7DD3FC";
const COULEUR_MONTANT_FENETRE = "#475569";

const HAUTEUR_PORTE_M = 2.1;
const HAUTEUR_ALLEGE_FENETRE_M = 0.9;
const HAUTEUR_LINTEAU_FENETRE_M = 2.1;
const EPAISSEUR_PANNEAU_M = EPAISSEUR_MUR_M * 1.05;

type Props = { plan: Plan };

export function Scene3D({ plan }: Props) {
  const [pleinEcran, setPleinEcran] = useState(false);

  return (
    <div className="flex h-full w-full flex-col">
      <Maquette3D plan={plan} className="flex-1" />
      <div className="flex items-center justify-between gap-4 border-t border-border bg-card px-4 py-2.5">
        <p className="text-sm text-muted-foreground">Pour mieux visualiser le plan, cliquez</p>
        <button
          type="button"
          onClick={() => setPleinEcran(true)}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Maximize2 className="size-4" />
          Plein écran
        </button>
      </div>

      {pleinEcran && <ModalPleinEcran plan={plan} onFermer={() => setPleinEcran(false)} />}
    </div>
  );
}

function ModalPleinEcran({ plan, onFermer }: { plan: Plan; onFermer: () => void }) {
  useEffect(() => {
    const surEchap = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFermer();
    };
    window.addEventListener("keydown", surEchap);
    return () => window.removeEventListener("keydown", surEchap);
  }, [onFermer]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-[90vh] w-[95vw] flex-col overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-medium text-foreground">Visualisation 3D du plan</p>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            title="Fermer"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <Maquette3D plan={plan} className="flex-1" />
      </div>
    </div>,
    document.body
  );
}

function Maquette3D({ plan, className = "" }: { plan: Plan; className?: string }) {
  const largeurTotale = plan.niveaux[0]?.largeurM ?? 10;
  const profondeurTotale = plan.niveaux[0]?.profondeurM ?? 10;
  const rayonCamera = Math.max(largeurTotale, profondeurTotale) * 1.4;

  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null);
  const [autoRotate, setAutoRotate] = useState(false);

  const zoom = (facteur: number) => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.dollyIn(facteur);
    controls.update();
  };

  const pivoter = (deltaAzimuth: number, deltaPolar: number) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const { object: camera, target } = controls;
    const decalage = camera.position.clone().sub(target);
    const spherique = new THREE.Spherical().setFromVector3(decalage);
    spherique.theta += deltaAzimuth;
    spherique.phi += deltaPolar;
    decalage.setFromSpherical(spherique);
    camera.position.copy(target).add(decalage);
    camera.lookAt(target);
    controls.update();
  };

  const reinitialiserVue = () => {
    controlsRef.current?.reset();
    setAutoRotate(false);
  };

  return (
    <div className={`flex w-full flex-col ${className}`}>
      <Canvas
        shadows
        camera={{ position: [rayonCamera, rayonCamera * 0.8, rayonCamera], fov: 45 }}
        className="flex-1 rounded-t-lg"
      >
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 15, 8]} intensity={1.2} castShadow />
      <Environment preset="city" />

      {plan.niveaux.map((niveau) => (
        <group key={niveau.index} position={[0, niveau.index * HAUTEUR_NIVEAU_M, 0]}>
          {niveau.pieces.map((piece) => (
            <group key={piece.id}>
              <mesh
                position={[
                  piece.rect.x + piece.rect.width / 2 - largeurTotale / 2,
                  0.05,
                  piece.rect.y + piece.rect.height / 2 - profondeurTotale / 2,
                ]}
                receiveShadow
              >
                <boxGeometry args={[piece.rect.width, 0.1, piece.rect.height]} />
                <meshStandardMaterial color={COULEUR_PIECE[piece.type]} />
              </mesh>
              <Text
                position={[
                  piece.rect.x + piece.rect.width / 2 - largeurTotale / 2,
                  0.15,
                  piece.rect.y + piece.rect.height / 2 - profondeurTotale / 2,
                ]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.3}
                color="#334155"
                anchorX="center"
                anchorY="middle"
              >
                {piece.nom}
              </Text>
              {piece.type !== "circulation" && (
                <MursPiece rect={piece.rect} largeurTotale={largeurTotale} profondeurTotale={profondeurTotale} />
              )}
            </group>
          ))}

          {niveau.ouvertures.map((ouverture, i) => (
            <Ouverture
              key={i}
              ouverture={ouverture}
              largeurTotale={largeurTotale}
              profondeurTotale={profondeurTotale}
            />
          ))}
        </group>
      ))}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2.1}
        autoRotate={autoRotate}
        autoRotateSpeed={1.2}
      />
      </Canvas>

      
      <div className="mt-6 flex items-center justify-between gap-4 border-border bg-card px-4 py-2.5">
        
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoom(1.2)}
            aria-label="Zoomer"
            title="Zoomer"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ZoomIn className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => zoom(0.8)}
            aria-label="Dézoomer"
            title="Dézoomer"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ZoomOut className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setAutoRotate((v) => !v)}
            aria-label="Rotation automatique"
            title="Rotation automatique"
            aria-pressed={autoRotate}
            className={`flex size-8 items-center justify-center rounded-md transition-colors hover:bg-muted ${
              autoRotate ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <RefreshCw className="size-4" />
          </button>
          <button
            type="button"
            onClick={reinitialiserVue}
            aria-label="Réinitialiser la vue"
            title="Réinitialiser la vue"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 grid-rows-3 gap-0.5" role="group" aria-label="Orienter la maquette">
          <span />
          <button
            type="button"
            onClick={() => pivoter(0, -PAS_ROTATION_RAD)}
            aria-label="Incliner vers le haut"
            title="Incliner vers le haut"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronUp className="size-4" />
          </button>
          <span />
          <button
            type="button"
            onClick={() => pivoter(-PAS_ROTATION_RAD, 0)}
            aria-label="Tourner à gauche"
            title="Tourner à gauche"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="flex size-7 items-center justify-center text-muted-foreground/40">
            <RefreshCw className="size-3.5" />
          </span>
          <button
            type="button"
            onClick={() => pivoter(PAS_ROTATION_RAD, 0)}
            aria-label="Tourner à droite"
            title="Tourner à droite"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
          <span />
          <button
            type="button"
            onClick={() => pivoter(0, PAS_ROTATION_RAD)}
            aria-label="Incliner vers le bas"
            title="Incliner vers le bas"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronDown className="size-4" />
          </button>
          <span />
        </div>
      </div>
    </div>
  );
}

/**
 * Murs approximatifs : chaque pièce reçoit ses 4 bords en boîtes fines.
 * Les murs mitoyens se superposent visuellement — simplification acceptée
 * pour une maquette de volumétrie, pas un plan d'exécution.
 */
function MursPiece({
  rect,
  largeurTotale,
  profondeurTotale,
}: {
  rect: { x: number; y: number; width: number; height: number };
  largeurTotale: number;
  profondeurTotale: number;
}) {
  const cx = rect.x - largeurTotale / 2;
  const cy = rect.y - profondeurTotale / 2;

  const murs = [
    { pos: [cx + rect.width / 2, cy], taille: [rect.width, EPAISSEUR_MUR_M] },
    { pos: [cx + rect.width / 2, cy + rect.height], taille: [rect.width, EPAISSEUR_MUR_M] },
    { pos: [cx, cy + rect.height / 2], taille: [EPAISSEUR_MUR_M, rect.height] },
    { pos: [cx + rect.width, cy + rect.height / 2], taille: [EPAISSEUR_MUR_M, rect.height] },
  ];

  return (
    <>
      {murs.map((mur, i) => (
        <mesh key={i} position={[mur.pos[0], HAUTEUR_NIVEAU_M / 2, mur.pos[1]]} castShadow receiveShadow>
          <boxGeometry args={[mur.taille[0], HAUTEUR_NIVEAU_M, mur.taille[1]]} />
          <meshStandardMaterial color={COULEUR_MUR} transparent opacity={0.4} />
        </mesh>
      ))}
    </>
  );
}

/**
 * Panneau plat encastré dans le mur, orienté selon le segment d'ouverture.
 * Porte : panneau plein sol-linteau + poignée. Fenêtre : vitrage semi-transparent
 * posé sur allège, avec croisillon — formes distinctes pour rester reconnaissables.
 */
function Ouverture({
  ouverture,
  largeurTotale,
  profondeurTotale,
}: {
  ouverture: OuvertureData;
  largeurTotale: number;
  profondeurTotale: number;
}) {
  const dx = ouverture.x2 - ouverture.x1;
  const dz = ouverture.y2 - ouverture.y1;
  const longueur = Math.max(Math.hypot(dx, dz), 0.6);
  const rotationY = -Math.atan2(dz, dx);
  const cx = (ouverture.x1 + ouverture.x2) / 2 - largeurTotale / 2;
  const cz = (ouverture.y1 + ouverture.y2) / 2 - profondeurTotale / 2;
  const largeurPanneau = longueur * 0.9;

  if (ouverture.type === "porte") {
    return (
      <group position={[cx, 0, cz]} rotation={[0, rotationY, 0]}>
        <mesh position={[0, HAUTEUR_PORTE_M / 2, 0]} castShadow>
          <boxGeometry args={[largeurPanneau, HAUTEUR_PORTE_M, EPAISSEUR_PANNEAU_M]} />
          <meshStandardMaterial color={COULEUR_PORTE} />
          <Edges color="#451A03" />
        </mesh>
        <mesh position={[largeurPanneau * 0.32, HAUTEUR_PORTE_M * 0.48, EPAISSEUR_PANNEAU_M * 0.6]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshStandardMaterial color={COULEUR_POIGNEE} metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    );
  }

  const hauteurVitrage = HAUTEUR_LINTEAU_FENETRE_M - HAUTEUR_ALLEGE_FENETRE_M;
  const centreY = HAUTEUR_ALLEGE_FENETRE_M + hauteurVitrage / 2;

  return (
    <group position={[cx, 0, cz]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, centreY, 0]}>
        <boxGeometry args={[largeurPanneau, hauteurVitrage, EPAISSEUR_PANNEAU_M]} />
        <meshPhysicalMaterial
          color={COULEUR_FENETRE}
          transparent
          opacity={0.35}
          roughness={0.1}
          metalness={0.1}
          transmission={0.4}
        />
      </mesh>
      <mesh position={[0, centreY, 0]}>
        <boxGeometry args={[largeurPanneau, hauteurVitrage, EPAISSEUR_PANNEAU_M * 1.02]} />
        <meshStandardMaterial color={COULEUR_MONTANT_FENETRE} wireframe />
      </mesh>
      <mesh position={[0, centreY, 0]}>
        <boxGeometry args={[largeurPanneau * 0.03, hauteurVitrage, EPAISSEUR_PANNEAU_M * 1.05]} />
        <meshStandardMaterial color={COULEUR_MONTANT_FENETRE} />
      </mesh>
      <mesh position={[0, centreY, 0]}>
        <boxGeometry args={[largeurPanneau, hauteurVitrage * 0.05, EPAISSEUR_PANNEAU_M * 1.05]} />
        <meshStandardMaterial color={COULEUR_MONTANT_FENETRE} />
      </mesh>
    </group>
  );
}
