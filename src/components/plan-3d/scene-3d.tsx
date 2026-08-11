"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Text } from "@react-three/drei";
import type { Plan, TypePiece } from "@/lib/plan-generator";

const EPAISSEUR_MUR_M = 0.15;
const HAUTEUR_NIVEAU_M = 3;

const COULEUR_PIECE: Record<TypePiece, string> = {
  salon: "#E2E8F0",
  cuisine: "#FDE68A",
  chambre: "#BFDBFE",
  wc: "#D1D5DB",
  circulation: "#F1F5F9",
  sdb: "#A7F3D0",
};

const COULEUR_MUR = "#94A3B8";
const COULEUR_PORTE = "#D97706";
const COULEUR_FENETRE = "#38BDF8";

type Props = { plan: Plan };

export function Scene3D({ plan }: Props) {
  const largeurTotale = plan.niveaux[0]?.largeurM ?? 10;
  const profondeurTotale = plan.niveaux[0]?.profondeurM ?? 10;
  const rayonCamera = Math.max(largeurTotale, profondeurTotale) * 1.4;

  return (
    <Canvas
      shadows
      camera={{ position: [rayonCamera, rayonCamera * 0.8, rayonCamera], fov: 45 }}
      className="rounded-lg"
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
              <MursPiece rect={piece.rect} largeurTotale={largeurTotale} profondeurTotale={profondeurTotale} />
            </group>
          ))}

          {niveau.ouvertures.map((ouverture, i) => (
            <mesh
              key={i}
              position={[
                (ouverture.x1 + ouverture.x2) / 2 - largeurTotale / 2,
                HAUTEUR_NIVEAU_M / 2,
                (ouverture.y1 + ouverture.y2) / 2 - profondeurTotale / 2,
              ]}
            >
              <boxGeometry args={[0.25, HAUTEUR_NIVEAU_M * 0.6, 0.25]} />
              <meshStandardMaterial
                color={ouverture.type === "porte" ? COULEUR_PORTE : COULEUR_FENETRE}
                emissive={ouverture.type === "porte" ? COULEUR_PORTE : COULEUR_FENETRE}
                emissiveIntensity={0.3}
              />
            </mesh>
          ))}
        </group>
      ))}

      <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2.1} />
    </Canvas>
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
          <meshStandardMaterial color={COULEUR_MUR} transparent opacity={0.85} />
        </mesh>
      ))}
    </>
  );
}
