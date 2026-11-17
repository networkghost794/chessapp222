import * as THREE from "three";
import type { Chess, Color, PieceSymbol, Square } from "chess.js";
import type { BoardMaterial3DId, PieceDesign3DId } from "@/lib/settings";
import {
  createBoardFrameTexture,
  createContactShadowTexture,
  createMarbleTexture,
  createWoodTexture,
} from "./proceduralTextures";
import {
  createPieceGeometryBank,
  createPiecePalette,
  type PieceGeometryBank,
  type PieceMaterialPalette,
} from "./pieceModels";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

export const BOARD_SURFACE_Y = 0.28;
export const PIECE_LIFT_HEIGHT = 0.44;
export const SQUARE_SIZE = 1.0;

const _dragLocalVec = new THREE.Vector3();

interface PieceEntity {
  key: string; // e.g. "wp"
  type: PieceSymbol;
  color: Color;
  group: THREE.Group;
  anim?: {
    fromX: number;
    fromY: number;
    fromZ: number;
    fromTiltX: number;
    toX: number;
    toY: number;
    toZ: number;
    toTiltX: number;
    arcHeight: number;
    progress: number;
    duration: number;
  };
}

export interface ChessBoard3DController {
  group: THREE.Group;
  setAppearance: (
    boardMat: BoardMaterial3DId,
    pieceDesign: PieceDesign3DId,
    anisotropy: number,
  ) => void;
  syncGame: (
    game: Chess,
    opts: {
      flipped: boolean;
      lastMove: { from: Square; to: Square } | null;
      selected: Square | null;
      legalTargets: Set<string>;
      animations: boolean;
      disabled: boolean;
    },
  ) => void;
  update: (dt: number) => void;
  pickSquare: (raycaster: THREE.Raycaster) => Square | null;
  pickPieceSquare: (raycaster: THREE.Raycaster) => Square | null;
  startDrag: (sq: Square, legalTargets: Set<string>) => boolean;
  moveDragToWorldPoint: (worldPoint: THREE.Vector3, legalTargets: Set<string>) => Square | null;
  commitDrop: (toSq: Square) => void;
  cancelDrag: () => void;
  isDraggingPiece: () => boolean;
  dispose: () => void;
}

function squareToLocal(sq: Square): { x: number; z: number } {
  const fileIdx = FILES.indexOf(sq[0] as (typeof FILES)[number]);
  const rankNum = Number(sq[1]);
  // file a (0) -> -3.5, h (7) -> +3.5
  // rank 8 -> -3.5 (far), rank 1 -> +3.5 (near)
  const x = (fileIdx - 3.5) * SQUARE_SIZE;
  const z = (4.5 - rankNum) * SQUARE_SIZE;
  return { x, z };
}

function setPieceGroupSquareTag(group: THREE.Group, sq: Square) {
  group.userData.pieceSquare = sq;
  group.traverse((obj) => {
    obj.userData.pieceSquare = sq;
  });
}

function setPieceContactShadowVisible(group: THREE.Group, visible: boolean) {
  const disc = group.children[group.children.length - 1];
  if (disc && (disc as THREE.Mesh).isMesh) {
    disc.visible = visible;
  }
}

export function createChessBoard3D(
  initialBoardMat: BoardMaterial3DId,
  initialPieceDesign: PieceDesign3DId,
  anisotropy = 4,
): ChessBoard3DController {
  const root = new THREE.Group();
  const boardPivot = new THREE.Group();
  root.add(boardPivot);

  const staticGeos: THREE.BufferGeometry[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    staticGeos.push(g);
    return g;
  };

  // Chamfered/beveled outer board frame for realistic specular edge highlights
  const frameShape = new THREE.Shape();
  const halfF = 4.62;
  frameShape.moveTo(-halfF, -halfF);
  frameShape.lineTo(halfF, -halfF);
  frameShape.lineTo(halfF, halfF);
  frameShape.lineTo(-halfF, halfF);
  frameShape.closePath();

  const frameBaseGeo = trackGeo(
    new THREE.ExtrudeGeometry(frameShape, {
      depth: 0.14,
      bevelEnabled: true,
      bevelSize: 0.08,
      bevelThickness: 0.06,
      bevelSegments: 3,
    }),
  );
  frameBaseGeo.rotateX(-Math.PI / 2);
  const frameBaseMesh = new THREE.Mesh(frameBaseGeo);
  frameBaseMesh.position.y = 0.06;
  frameBaseMesh.castShadow = true;
  frameBaseMesh.receiveShadow = true;
  boardPivot.add(frameBaseMesh);

  // Top frame surface plane with inlaid trim & subtle engraved coordinates
  const frameTopGeo = trackGeo(new THREE.PlaneGeometry(9.26, 9.26));
  frameTopGeo.rotateX(-Math.PI / 2);
  const frameTopMesh = new THREE.Mesh(frameTopGeo);
  frameTopMesh.position.y = BOARD_SURFACE_Y - 0.015;
  frameTopMesh.receiveShadow = true;
  boardPivot.add(frameTopMesh);

  // Brass hinges/clasps detail on walnut/mahogany edge
  const claspGeo = trackGeo(new THREE.BoxGeometry(0.04, 0.09, 0.44));
  const claspMat = new THREE.MeshStandardMaterial({
    color: "#c9a86a",
    roughness: 0.28,
    metalness: 0.85,
  });
  const claspMesh = new THREE.Mesh(claspGeo, claspMat);
  claspMesh.position.set(-4.7, 0.14, 0);
  boardPivot.add(claspMesh);

  // 64 individual square tiles + raycast hit targets + highlight overlays
  const tileGeo = trackGeo(new THREE.BoxGeometry(SQUARE_SIZE, 0.03, SQUARE_SIZE));
  const highlightGeo = trackGeo(new THREE.PlaneGeometry(SQUARE_SIZE * 0.96, SQUARE_SIZE * 0.96));
  highlightGeo.rotateX(-Math.PI / 2);
  const dotGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.014, 24));
  const targetGlowRingGeo = trackGeo(new THREE.RingGeometry(0.26, 0.37, 32));
  targetGlowRingGeo.rotateX(-Math.PI / 2);
  const captureRingGeo = trackGeo(new THREE.RingGeometry(0.34, 0.45, 32));
  captureRingGeo.rotateX(-Math.PI / 2);
  const dragShadowGeo = trackGeo(new THREE.PlaneGeometry(1.02, 1.02));
  dragShadowGeo.rotateX(-Math.PI / 2);

  const selectedMat = new THREE.MeshBasicMaterial({
    color: "#f5c443",
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const lastMoveMat = new THREE.MeshBasicMaterial({
    color: "#eab308",
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const checkMat = new THREE.MeshBasicMaterial({
    color: "#ef4444",
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  const dragHoverMat = new THREE.MeshBasicMaterial({
    color: "#10b981",
    transparent: true,
    opacity: 0.44,
    depthWrite: false,
  });
  const legalDotMat = new THREE.MeshBasicMaterial({
    color: "#10b981",
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const legalRingMat = new THREE.MeshBasicMaterial({
    color: "#10b981",
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  const dragHoverRingMat = new THREE.MeshBasicMaterial({
    color: "#6ee7b7",
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
  });

  const dragShadowTex = createContactShadowTexture();
  const dragShadowMat = new THREE.MeshBasicMaterial({
    map: dragShadowTex,
    transparent: true,
    opacity: 0.44,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const dragGroundShadow = new THREE.Mesh(dragShadowGeo, dragShadowMat);
  dragGroundShadow.position.set(0, BOARD_SURFACE_Y + 0.005, 0);
  dragGroundShadow.visible = false;
  boardPivot.add(dragGroundShadow);

  const squareTiles: Array<{
    square: Square;
    isDark: boolean;
    tile: THREE.Mesh;
    tintOverlay: THREE.Mesh;
    dotOverlay: THREE.Mesh;
    ringOverlay: THREE.Mesh;
  }> = [];
  const pickTargets: THREE.Mesh[] = [];

  for (const rank of RANKS) {
    for (let fIdx = 0; fIdx < 8; fIdx++) {
      const file = FILES[fIdx];
      const square = (file + rank) as Square;
      const rankIdx = rank - 1;
      const isLight = (fIdx + rankIdx) % 2 === 1;
      const isDark = !isLight;
      const { x, z } = squareToLocal(square);

      const tile = new THREE.Mesh(tileGeo);
      tile.position.set(x, BOARD_SURFACE_Y - 0.015, z);
      tile.receiveShadow = true;
      tile.userData.square = square;
      boardPivot.add(tile);
      pickTargets.push(tile);

      const tintOverlay = new THREE.Mesh(highlightGeo, selectedMat);
      tintOverlay.position.set(x, BOARD_SURFACE_Y + 0.004, z);
      tintOverlay.visible = false;
      boardPivot.add(tintOverlay);

      const dotOverlay = new THREE.Mesh(dotGeo, legalDotMat);
      dotOverlay.position.set(x, BOARD_SURFACE_Y + 0.008, z);
      dotOverlay.visible = false;
      boardPivot.add(dotOverlay);

      const ringOverlay = new THREE.Mesh(captureRingGeo, legalRingMat);
      ringOverlay.position.set(x, BOARD_SURFACE_Y + 0.008, z);
      ringOverlay.visible = false;
      boardPivot.add(ringOverlay);

      squareTiles.push({ square, isDark, tile, tintOverlay, dotOverlay, ringOverlay });
    }
  }

  // Dynamic board materials & piece banks
  let boardMatsToDispose: THREE.Material[] = [];
  let boardTexturesToDispose: THREE.Texture[] = [];
  let piecePalette: PieceMaterialPalette | null = null;
  let pieceBank: PieceGeometryBank | null = null;

  let currentBoardMatId: BoardMaterial3DId | null = null;
  let currentPieceDesignId: PieceDesign3DId | null = null;

  // Track active pieces keyed by Square
  const piecesLayer = new THREE.Group();
  boardPivot.add(piecesLayer);
  const pieceMap = new Map<Square, PieceEntity>();

  let targetFlipY = 0;
  let currentFlipY = 0;
  let lastFen = "";

  // Drag-and-drop runtime state
  let activeDrag: {
    from: Square;
    entity: PieceEntity;
    currentX: number;
    currentY: number;
    currentZ: number;
    currentTiltX: number;
    targetX: number;
    targetZ: number;
    hoverSq: Square | null;
    legalTargets: Set<string>;
  } | null = null;

  let recentDrop: {
    from: Square;
    to: Square;
    x: number;
    y: number;
    z: number;
    tiltX: number;
  } | null = null;

  let lastSyncCtx: {
    game: Chess;
    lastMove: { from: Square; to: Square } | null;
    selected: Square | null;
    legalTargets: Set<string>;
    disabled: boolean;
  } | null = null;

  const clearDynamicBoardMats = () => {
    boardMatsToDispose.forEach((m) => m.dispose());
    boardMatsToDispose = [];
    boardTexturesToDispose.forEach((t) => t.dispose());
    boardTexturesToDispose = [];
  };

  const clearDynamicPieceResources = () => {
    if (piecePalette) {
      piecePalette.whiteMain.dispose();
      piecePalette.blackMain.dispose();
      piecePalette.whiteTrim.dispose();
      piecePalette.blackTrim.dispose();
      piecePalette.whiteFelt.dispose();
      piecePalette.blackFelt.dispose();
      piecePalette.contactShadowMat.dispose();
      piecePalette.textures.forEach((t) => t.dispose());
      piecePalette = null;
    }
    if (pieceBank) {
      pieceBank.dispose();
      pieceBank = null;
    }
  };

  const applyBoardMaterials = (boardMatId: BoardMaterial3DId, anisotropyVal: number) => {
    clearDynamicBoardMats();

    let lightMat: THREE.Material;
    let darkMat: THREE.Material;
    let frameSideMat: THREE.Material;
    let frameTopMat: THREE.Material;

    if (boardMatId === "marble") {
      const lTex = createMarbleTexture("#efede7", "#b5b0a4", {
        seed: 12,
        anisotropy: anisotropyVal,
      });
      const dTex = createMarbleTexture("#2c3138", "#6f7785", {
        seed: 29,
        anisotropy: anisotropyVal,
      });
      const fTex = createBoardFrameTexture({
        frameBaseHex: "#30343b",
        frameGrainHex: "#555c67",
        inlayHex: "#dad6cc",
        textHex: "#e6e2d8",
        anisotropy: anisotropyVal,
      });
      boardTexturesToDispose.push(lTex, dTex, fTex);
      lightMat = new THREE.MeshPhysicalMaterial({
        map: lTex,
        roughness: 0.16,
        metalness: 0.02,
        clearcoat: 0.72,
        clearcoatRoughness: 0.12,
      });
      darkMat = new THREE.MeshPhysicalMaterial({
        map: dTex,
        roughness: 0.18,
        metalness: 0.04,
        clearcoat: 0.72,
        clearcoatRoughness: 0.12,
      });
      frameSideMat = new THREE.MeshPhysicalMaterial({
        color: "#2c3037",
        roughness: 0.22,
        metalness: 0.04,
        clearcoat: 0.5,
      });
      frameTopMat = new THREE.MeshPhysicalMaterial({
        map: fTex,
        roughness: 0.18,
        metalness: 0.03,
        clearcoat: 0.65,
      });
      claspMesh.visible = false;
    } else if (boardMatId === "mahogany") {
      // Matches user reference photo #2 (warm reddish mahogany & maple with algebraic coordinates)
      const lTex = createWoodTexture("#eddab8", "#d2b483", {
        seed: 64,
        streaks: 55,
        anisotropy: anisotropyVal,
      });
      const dTex = createWoodTexture("#8d3e23", "#582210", {
        seed: 77,
        streaks: 70,
        anisotropy: anisotropyVal,
      });
      const fTex = createBoardFrameTexture({
        frameBaseHex: "#82371e",
        frameGrainHex: "#511d0c",
        inlayHex: "#ecd7b3",
        textHex: "#f0dcb8",
        anisotropy: anisotropyVal,
      });
      boardTexturesToDispose.push(lTex, dTex, fTex);
      lightMat = new THREE.MeshPhysicalMaterial({
        map: lTex,
        roughness: 0.3,
        metalness: 0.02,
        clearcoat: 0.35,
        clearcoatRoughness: 0.24,
      });
      darkMat = new THREE.MeshPhysicalMaterial({
        map: dTex,
        roughness: 0.32,
        metalness: 0.02,
        clearcoat: 0.38,
        clearcoatRoughness: 0.22,
      });
      frameSideMat = new THREE.MeshPhysicalMaterial({
        color: "#763019",
        roughness: 0.34,
        clearcoat: 0.32,
      });
      frameTopMat = new THREE.MeshPhysicalMaterial({
        map: fTex,
        roughness: 0.32,
        clearcoat: 0.34,
      });
      claspMesh.visible = false;
    } else if (boardMatId === "glass") {
      const fTex = createBoardFrameTexture({
        frameBaseHex: "#4b6275",
        frameGrainHex: "#6e889c",
        inlayHex: "#d6e9f5",
        textHex: "#eaf4fa",
        anisotropy: anisotropyVal,
      });
      boardTexturesToDispose.push(fTex);
      lightMat = new THREE.MeshPhysicalMaterial({
        color: "#dcecf5",
        roughness: 0.14,
        metalness: 0.05,
        transparent: true,
        opacity: 0.78,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
      });
      darkMat = new THREE.MeshPhysicalMaterial({
        color: "#2c4152",
        roughness: 0.08,
        metalness: 0.12,
        transparent: true,
        opacity: 0.85,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
      });
      frameSideMat = new THREE.MeshPhysicalMaterial({
        color: "#6b8599",
        roughness: 0.16,
        metalness: 0.3,
        clearcoat: 0.8,
      });
      frameTopMat = new THREE.MeshPhysicalMaterial({
        map: fTex,
        roughness: 0.14,
        metalness: 0.15,
        clearcoat: 0.85,
      });
      claspMesh.visible = false;
    } else {
      // Walnut & Maple (Matches user reference photo #4!)
      const lTex = createWoodTexture("#edd6b1", "#d4b484", {
        seed: 31,
        streaks: 50,
        anisotropy: anisotropyVal,
      });
      const dTex = createWoodTexture("#6c4529", "#422714", {
        seed: 47,
        streaks: 75,
        anisotropy: anisotropyVal,
      });
      const fTex = createBoardFrameTexture({
        frameBaseHex: "#613d24",
        frameGrainHex: "#3c2211",
        inlayHex: "#c9a675",
        textHex: "#ebd3ad",
        showCoords: true,
        anisotropy: anisotropyVal,
      });
      boardTexturesToDispose.push(lTex, dTex, fTex);
      lightMat = new THREE.MeshPhysicalMaterial({
        map: lTex,
        roughness: 0.32,
        metalness: 0.02,
        clearcoat: 0.36,
        clearcoatRoughness: 0.24,
      });
      darkMat = new THREE.MeshPhysicalMaterial({
        map: dTex,
        roughness: 0.34,
        metalness: 0.02,
        clearcoat: 0.38,
        clearcoatRoughness: 0.22,
      });
      frameSideMat = new THREE.MeshPhysicalMaterial({
        color: "#57361f",
        roughness: 0.3,
        clearcoat: 0.45,
        clearcoatRoughness: 0.2,
      });
      frameTopMat = new THREE.MeshPhysicalMaterial({
        map: fTex,
        roughness: 0.3,
        clearcoat: 0.45,
        clearcoatRoughness: 0.2,
      });
      claspMesh.visible = true;
    }

    boardMatsToDispose.push(lightMat, darkMat, frameSideMat, frameTopMat);
    frameBaseMesh.material = frameSideMat;
    frameTopMesh.material = frameTopMat;
    for (const sq of squareTiles) {
      sq.tile.material = sq.isDark ? darkMat : lightMat;
    }
  };

  const rebuildAllPieces = (game: Chess) => {
    for (const entity of pieceMap.values()) {
      piecesLayer.remove(entity.group);
    }
    pieceMap.clear();
    dragGroundShadow.visible = false;
    activeDrag = null;
    if (!pieceBank || !piecePalette) return;

    for (const rank of RANKS) {
      for (const file of FILES) {
        const sq = (file + rank) as Square;
        const p = game.get(sq);
        if (!p) continue;
        const g = pieceBank.buildPiece(p.type, p.color, piecePalette, sq);
        const { x, z } = squareToLocal(sq);
        g.position.set(x, BOARD_SURFACE_Y, z);
        setPieceGroupSquareTag(g, sq);
        piecesLayer.add(g);
        pieceMap.set(sq, {
          key: `${p.color}${p.type}`,
          type: p.type,
          color: p.color,
          group: g,
        });
      }
    }
  };

  const applySquareIndicators = () => {
    if (!lastSyncCtx) return;
    const { game, lastMove, selected, legalTargets, disabled } = lastSyncCtx;

    let checkSquare: Square | null = null;
    if (game.inCheck()) {
      const turn = game.turn();
      for (const rank of RANKS) {
        for (const file of FILES) {
          const sq = (file + rank) as Square;
          const p = game.get(sq);
          if (p && p.type === "k" && p.color === turn) {
            checkSquare = sq;
            break;
          }
        }
        if (checkSquare) break;
      }
    }

    const activeLegalTargets = activeDrag ? activeDrag.legalTargets : legalTargets;
    const activeSelected = activeDrag ? activeDrag.from : selected;
    const dragHoverSq = activeDrag ? activeDrag.hoverSq : null;

    for (const item of squareTiles) {
      const { square, tintOverlay, dotOverlay, ringOverlay } = item;
      const isSelected = !disabled && activeSelected === square;
      const isCheck = checkSquare === square;
      const isLast = lastMove ? lastMove.from === square || lastMove.to === square : false;
      const isLegal = !disabled && activeLegalTargets.has(square);
      const isHoveredLegal = Boolean(activeDrag && isLegal && dragHoverSq === square);

      if (isHoveredLegal) {
        tintOverlay.material = dragHoverMat;
        tintOverlay.visible = true;
      } else if (isCheck) {
        tintOverlay.material = checkMat;
        tintOverlay.visible = true;
      } else if (isSelected) {
        tintOverlay.material = selectedMat;
        tintOverlay.visible = true;
      } else if (isLast) {
        tintOverlay.material = lastMoveMat;
        tintOverlay.visible = true;
      } else {
        tintOverlay.visible = false;
      }

      if (isLegal) {
        const occupant = game.get(square);
        if (activeDrag) {
          // While dragging, render crisp circular target rings on every legal square
          dotOverlay.visible = false;
          ringOverlay.geometry = occupant || isHoveredLegal ? captureRingGeo : targetGlowRingGeo;
          ringOverlay.material = isHoveredLegal ? dragHoverRingMat : legalRingMat;
          ringOverlay.scale.setScalar(isHoveredLegal ? 1.12 : 1.0);
          ringOverlay.visible = true;
        } else {
          dotOverlay.visible = !occupant;
          ringOverlay.geometry = captureRingGeo;
          ringOverlay.material = legalRingMat;
          ringOverlay.scale.setScalar(1.0);
          ringOverlay.visible = !!occupant;
        }
      } else {
        dotOverlay.visible = false;
        ringOverlay.visible = false;
      }
    }
  };

  const setAppearance = (
    boardMatId: BoardMaterial3DId,
    pieceDesignId: PieceDesign3DId,
    anisotropyVal: number,
  ) => {
    if (boardMatId !== currentBoardMatId) {
      currentBoardMatId = boardMatId;
      applyBoardMaterials(boardMatId, anisotropyVal);
    }
    if (pieceDesignId !== currentPieceDesignId) {
      currentPieceDesignId = pieceDesignId;
      clearDynamicPieceResources();
      piecePalette = createPiecePalette(pieceDesignId, anisotropyVal);
      pieceBank = createPieceGeometryBank(pieceDesignId);
      lastFen = ""; // trigger full piece rebuild on next syncGame
    }
  };

  setAppearance(initialBoardMat, initialPieceDesign, anisotropy);

  return {
    group: root,
    setAppearance,
    syncGame(game, { flipped, lastMove, selected, legalTargets, animations, disabled }) {
      targetFlipY = flipped ? Math.PI : 0;
      if (!animations) {
        currentFlipY = targetFlipY;
        boardPivot.rotation.y = currentFlipY;
      }

      lastSyncCtx = { game, lastMove, selected, legalTargets, disabled };
      applySquareIndicators();

      const fen = game.fen();
      if (fen === lastFen) return;

      // Animate piece moves smoothly if lastMove maps cleanly and animations are enabled
      if (lastFen === "" || !animations || !pieceBank || !piecePalette) {
        rebuildAllPieces(game);
        lastFen = fen;
        return;
      }

      const movedPieces: Array<{ from: Square; to: Square; entity: PieceEntity }> = [];

      if (lastMove) {
        const fromEntity = pieceMap.get(lastMove.from);
        const destPiece = game.get(lastMove.to);
        if (
          fromEntity &&
          destPiece &&
          fromEntity.key === `${destPiece.color}${destPiece.type}` &&
          !game.get(lastMove.from)
        ) {
          movedPieces.push({ from: lastMove.from, to: lastMove.to, entity: fromEntity });

          // Check castling rook transfer too
          if (
            destPiece.type === "k" &&
            Math.abs(lastMove.from.charCodeAt(0) - lastMove.to.charCodeAt(0)) === 2
          ) {
            const rankStr = lastMove.from[1];
            const isKingSide = lastMove.to[0] === "g";
            const rookFrom = ((isKingSide ? "h" : "a") + rankStr) as Square;
            const rookTo = ((isKingSide ? "f" : "d") + rankStr) as Square;
            const rookEntity = pieceMap.get(rookFrom);
            if (rookEntity && rookEntity.type === "r" && !game.get(rookFrom)) {
              movedPieces.push({ from: rookFrom, to: rookTo, entity: rookEntity });
            }
          }
        }
      }

      if (movedPieces.length > 0) {
        for (const mp of movedPieces) {
          // Remove any captured piece at destination (and en-passant pawn if applicable)
          const existingAtDest = pieceMap.get(mp.to);
          if (existingAtDest) {
            piecesLayer.remove(existingAtDest.group);
            pieceMap.delete(mp.to);
          }
          pieceMap.delete(mp.from);
          pieceMap.set(mp.to, mp.entity);
          setPieceGroupSquareTag(mp.entity.group, mp.to);

          const startPos = squareToLocal(mp.from);
          const endPos = squareToLocal(mp.to);

          if (recentDrop && recentDrop.from === mp.from && recentDrop.to === mp.to) {
            // Piece was just dragged by hand directly onto target square — snap cleanly down!
            mp.entity.anim = {
              fromX: recentDrop.x,
              fromY: recentDrop.y,
              fromZ: recentDrop.z,
              fromTiltX: recentDrop.tiltX,
              toX: endPos.x,
              toY: BOARD_SURFACE_Y,
              toZ: endPos.z,
              toTiltX: 0,
              arcHeight: 0,
              progress: 0,
              duration: 0.11,
            };
            recentDrop = null;
          } else {
            mp.entity.anim = {
              fromX: startPos.x,
              fromY: BOARD_SURFACE_Y,
              fromZ: startPos.z,
              fromTiltX: 0,
              toX: endPos.x,
              toY: BOARD_SURFACE_Y,
              toZ: endPos.z,
              toTiltX: 0,
              arcHeight: 0.62,
              progress: 0,
              duration: 0.24,
            };
          }
        }

        // Verify all 64 squares match (catches en-passant captures or edge cases)
        for (const rank of RANKS) {
          for (const file of FILES) {
            const sq = (file + rank) as Square;
            const boardP = game.get(sq);
            const tracked = pieceMap.get(sq);
            if (!boardP && tracked) {
              piecesLayer.remove(tracked.group);
              pieceMap.delete(sq);
            } else if (boardP && (!tracked || tracked.key !== `${boardP.color}${boardP.type}`)) {
              if (tracked) piecesLayer.remove(tracked.group);
              const g = pieceBank.buildPiece(boardP.type, boardP.color, piecePalette, sq);
              const { x, z } = squareToLocal(sq);
              g.position.set(x, BOARD_SURFACE_Y, z);
              setPieceGroupSquareTag(g, sq);
              piecesLayer.add(g);
              pieceMap.set(sq, {
                key: `${boardP.color}${boardP.type}`,
                type: boardP.type,
                color: boardP.color,
                group: g,
              });
            }
          }
        }
      } else {
        // Promotion, undo, reset, or full jump: rebuild cleanly
        recentDrop = null;
        rebuildAllPieces(game);
      }

      lastFen = fen;
    },
    startDrag(sq, legalTargets) {
      const entity = pieceMap.get(sq);
      if (!entity) return false;
      entity.anim = undefined;
      recentDrop = null;
      const pos = squareToLocal(sq);
      activeDrag = {
        from: sq,
        entity,
        currentX: entity.group.position.x,
        currentY: Math.max(BOARD_SURFACE_Y, entity.group.position.y),
        currentZ: entity.group.position.z,
        currentTiltX: entity.group.rotation.x,
        targetX: pos.x,
        targetZ: pos.z,
        hoverSq: sq,
        legalTargets,
      };
      setPieceContactShadowVisible(entity.group, false);
      dragGroundShadow.position.set(
        activeDrag.currentX,
        BOARD_SURFACE_Y + 0.005,
        activeDrag.currentZ,
      );
      dragGroundShadow.scale.setScalar(1.1);
      dragGroundShadow.visible = true;
      applySquareIndicators();
      return true;
    },
    moveDragToWorldPoint(worldPoint, legalTargets) {
      if (!activeDrag) return null;
      _dragLocalVec.copy(worldPoint);
      boardPivot.worldToLocal(_dragLocalVec);

      const clampedX = Math.max(-4.35, Math.min(4.35, _dragLocalVec.x));
      const clampedZ = Math.max(-4.35, Math.min(4.35, _dragLocalVec.z));
      activeDrag.targetX = clampedX;
      activeDrag.targetZ = clampedZ;
      activeDrag.legalTargets = legalTargets;

      const col = Math.round(_dragLocalVec.x + 3.5);
      const rank = Math.round(4.5 - _dragLocalVec.z);
      const insideGrid =
        col >= 0 &&
        col <= 7 &&
        rank >= 1 &&
        rank <= 8 &&
        Math.abs(_dragLocalVec.x) <= 4.05 &&
        Math.abs(_dragLocalVec.z) <= 4.05;
      const hoverSq = insideGrid ? ((FILES[col] + rank) as Square) : null;

      if (hoverSq !== activeDrag.hoverSq) {
        activeDrag.hoverSq = hoverSq;
        applySquareIndicators();
      }
      return hoverSq;
    },
    commitDrop(toSq) {
      if (!activeDrag) return;
      const { from, entity, currentX, currentY, currentZ, currentTiltX } = activeDrag;
      const endPos = squareToLocal(toSq);
      recentDrop = {
        from,
        to: toSq,
        x: currentX,
        y: currentY,
        z: currentZ,
        tiltX: currentTiltX,
      };
      // Also set an immediate snap-down animation in case pawn promotion opens before FEN changes
      entity.anim = {
        fromX: currentX,
        fromY: currentY,
        fromZ: currentZ,
        fromTiltX: currentTiltX,
        toX: endPos.x,
        toY: BOARD_SURFACE_Y,
        toZ: endPos.z,
        toTiltX: 0,
        arcHeight: 0,
        progress: 0,
        duration: 0.11,
      };
      activeDrag = null;
      dragGroundShadow.visible = false;
      setPieceContactShadowVisible(entity.group, true);
      applySquareIndicators();
    },
    cancelDrag() {
      if (!activeDrag) return;
      const { from, entity, currentX, currentY, currentZ, currentTiltX } = activeDrag;
      const origin = squareToLocal(from);
      entity.anim = {
        fromX: currentX,
        fromY: currentY,
        fromZ: currentZ,
        fromTiltX: currentTiltX,
        toX: origin.x,
        toY: BOARD_SURFACE_Y,
        toZ: origin.z,
        toTiltX: 0,
        arcHeight: 0,
        progress: 0,
        duration: 0.18,
      };
      activeDrag = null;
      dragGroundShadow.visible = false;
      setPieceContactShadowVisible(entity.group, true);
      applySquareIndicators();
    },
    isDraggingPiece() {
      return activeDrag !== null;
    },
    update(dt) {
      // Smoothly damp board flip rotation
      if (Math.abs(targetFlipY - currentFlipY) > 0.001) {
        currentFlipY = THREE.MathUtils.damp(currentFlipY, targetFlipY, 10, dt);
        boardPivot.rotation.y = currentFlipY;
      } else if (currentFlipY !== targetFlipY) {
        currentFlipY = targetFlipY;
        boardPivot.rotation.y = currentFlipY;
      }

      // Smoothly track lifted dragged piece & ground shadow
      if (activeDrag) {
        activeDrag.currentX = THREE.MathUtils.damp(activeDrag.currentX, activeDrag.targetX, 28, dt);
        activeDrag.currentZ = THREE.MathUtils.damp(activeDrag.currentZ, activeDrag.targetZ, 28, dt);
        activeDrag.currentY = THREE.MathUtils.damp(
          activeDrag.currentY,
          BOARD_SURFACE_Y + PIECE_LIFT_HEIGHT,
          20,
          dt,
        );
        activeDrag.currentTiltX = THREE.MathUtils.damp(activeDrag.currentTiltX, 0.08, 18, dt);

        activeDrag.entity.group.position.set(
          activeDrag.currentX,
          activeDrag.currentY,
          activeDrag.currentZ,
        );
        activeDrag.entity.group.rotation.x = activeDrag.currentTiltX;

        const hoveringValid = Boolean(
          activeDrag.hoverSq && activeDrag.legalTargets.has(activeDrag.hoverSq),
        );
        dragGroundShadow.position.set(
          activeDrag.currentX,
          BOARD_SURFACE_Y + 0.005,
          activeDrag.currentZ,
        );
        dragGroundShadow.scale.setScalar(hoveringValid ? 1.06 : 1.18);
        dragShadowMat.opacity = hoveringValid ? 0.52 : 0.36;
      }

      // Advance parabolic move / snap-down / spring-back animations
      for (const entity of pieceMap.values()) {
        if (!entity.anim) continue;
        entity.anim.progress = Math.min(1, entity.anim.progress + dt / entity.anim.duration);
        const t = entity.anim.progress;
        // Smooth cubic ease-in-out (or ease-out for snap/spring-back)
        const eased =
          entity.anim.arcHeight > 0
            ? t < 0.5
              ? 4 * t * t * t
              : 1 - Math.pow(-2 * t + 2, 3) / 2
            : 1 - Math.pow(1 - t, 3);
        const x = THREE.MathUtils.lerp(entity.anim.fromX, entity.anim.toX, eased);
        const y = THREE.MathUtils.lerp(entity.anim.fromY, entity.anim.toY, eased);
        const z = THREE.MathUtils.lerp(entity.anim.fromZ, entity.anim.toZ, eased);
        const tiltX = THREE.MathUtils.lerp(entity.anim.fromTiltX, entity.anim.toTiltX, eased);
        const arc = entity.anim.arcHeight > 0 ? Math.sin(t * Math.PI) * entity.anim.arcHeight : 0;
        entity.group.position.set(x, y + arc, z);
        entity.group.rotation.x = tiltX;
        if (t >= 1) {
          entity.group.position.set(entity.anim.toX, entity.anim.toY, entity.anim.toZ);
          entity.group.rotation.x = entity.anim.toTiltX;
          entity.anim = undefined;
        }
      }
    },
    pickSquare(raycaster) {
      const hits = raycaster.intersectObjects(pickTargets, false);
      if (hits.length === 0) return null;
      return (hits[0].object.userData.square as Square) ?? null;
    },
    pickPieceSquare(raycaster) {
      const hits = raycaster.intersectObjects(piecesLayer.children, true);
      for (const hit of hits) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj && obj !== piecesLayer) {
          if (obj.userData.pieceSquare) {
            return obj.userData.pieceSquare as Square;
          }
          obj = obj.parent;
        }
      }
      return null;
    },
    dispose() {
      clearDynamicBoardMats();
      clearDynamicPieceResources();
      staticGeos.forEach((g) => g.dispose());
      claspMat.dispose();
      selectedMat.dispose();
      lastMoveMat.dispose();
      checkMat.dispose();
      dragHoverMat.dispose();
      legalDotMat.dispose();
      legalRingMat.dispose();
      dragHoverRingMat.dispose();
      dragShadowMat.dispose();
      dragShadowTex.dispose();
    },
  };
}
