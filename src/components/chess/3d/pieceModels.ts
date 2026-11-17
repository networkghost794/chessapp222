import * as THREE from "three";
import type { Color, PieceSymbol, Square } from "chess.js";
import type { PieceDesign3DId } from "@/lib/settings";
import {
  createContactShadowTexture,
  createMarbleTexture,
  createWoodTexture,
} from "./proceduralTextures";

export interface PieceMaterialPalette {
  whiteMain: THREE.Material;
  blackMain: THREE.Material;
  whiteTrim: THREE.Material;
  blackTrim: THREE.Material;
  whiteFelt: THREE.Material;
  blackFelt: THREE.Material;
  contactShadowMat: THREE.Material;
  textures: THREE.Texture[];
}

export interface PieceGeometryBank {
  design: PieceDesign3DId;
  geometries: THREE.BufferGeometry[];
  buildPiece: (
    type: PieceSymbol,
    color: Color,
    palette: PieceMaterialPalette,
    square?: Square,
  ) => THREE.Group;
  dispose: () => void;
}

export function createPiecePalette(design: PieceDesign3DId, anisotropy = 4): PieceMaterialPalette {
  const textures: THREE.Texture[] = [];
  const shadowTex = createContactShadowTexture();
  textures.push(shadowTex);
  const contactShadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });

  if (design === "staunton_marble") {
    const wTex = createMarbleTexture("#f4f1ea", "#b8b2a6", { seed: 41, anisotropy });
    const bTex = createMarbleTexture("#26292e", "#5b616c", { seed: 73, anisotropy });
    textures.push(wTex, bTex);

    const whiteMain = new THREE.MeshPhysicalMaterial({
      map: wTex,
      roughness: 0.18,
      metalness: 0.02,
      clearcoat: 0.65,
      clearcoatRoughness: 0.14,
    });
    const blackMain = new THREE.MeshPhysicalMaterial({
      map: bTex,
      roughness: 0.2,
      metalness: 0.04,
      clearcoat: 0.65,
      clearcoatRoughness: 0.14,
    });
    const whiteTrim = new THREE.MeshStandardMaterial({
      color: "#d9c297",
      roughness: 0.35,
      metalness: 0.35,
    });
    const blackTrim = new THREE.MeshStandardMaterial({
      color: "#c5a76d",
      roughness: 0.35,
      metalness: 0.4,
    });
    const felt = new THREE.MeshStandardMaterial({
      color: "#214e36",
      roughness: 0.94,
      metalness: 0,
    });
    return {
      whiteMain,
      blackMain,
      whiteTrim,
      blackTrim,
      whiteFelt: felt,
      blackFelt: felt,
      contactShadowMat,
      textures,
    };
  }

  if (design === "modern_metal") {
    const whiteMain = new THREE.MeshStandardMaterial({
      color: "#dce2ea",
      roughness: 0.22,
      metalness: 0.88,
    });
    const blackMain = new THREE.MeshStandardMaterial({
      color: "#2b313c",
      roughness: 0.26,
      metalness: 0.9,
    });
    const whiteTrim = new THREE.MeshStandardMaterial({
      color: "#f2f5f8",
      roughness: 0.16,
      metalness: 0.95,
    });
    const blackTrim = new THREE.MeshStandardMaterial({
      color: "#8e99aa",
      roughness: 0.22,
      metalness: 0.92,
    });
    const felt = new THREE.MeshStandardMaterial({
      color: "#15181d",
      roughness: 0.9,
      metalness: 0.05,
    });
    return {
      whiteMain,
      blackMain,
      whiteTrim,
      blackTrim,
      whiteFelt: felt,
      blackFelt: felt,
      contactShadowMat,
      textures,
    };
  }

  // Default: handcrafted Staunton wood (Boxwood & Rosewood + green baize felt pad)
  const wTex = createWoodTexture("#edd6aa", "#c8a369", { seed: 19, streaks: 45, anisotropy });
  const bTex = createWoodTexture("#6e3922", "#3e1d10", { seed: 53, streaks: 55, anisotropy });
  textures.push(wTex, bTex);

  const whiteMain = new THREE.MeshPhysicalMaterial({
    map: wTex,
    roughness: 0.32,
    metalness: 0.02,
    clearcoat: 0.35,
    clearcoatRoughness: 0.26,
  });
  const blackMain = new THREE.MeshPhysicalMaterial({
    map: bTex,
    roughness: 0.34,
    metalness: 0.02,
    clearcoat: 0.38,
    clearcoatRoughness: 0.24,
  });
  const whiteTrim = new THREE.MeshStandardMaterial({
    color: "#dfbe87",
    roughness: 0.38,
    metalness: 0.04,
  });
  const blackTrim = new THREE.MeshStandardMaterial({
    color: "#512817",
    roughness: 0.38,
    metalness: 0.04,
  });
  const felt = new THREE.MeshStandardMaterial({
    color: "#1c6b3b",
    roughness: 0.95,
    metalness: 0,
  });

  return {
    whiteMain,
    blackMain,
    whiteTrim,
    blackTrim,
    whiteFelt: felt,
    blackFelt: felt,
    contactShadowMat,
    textures,
  };
}

function makeLathe(profile: Array<[number, number]>, segments = 26): THREE.LatheGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, segments);
  geo.computeVertexNormals();
  return geo;
}

export function createPieceGeometryBank(design: PieceDesign3DId): PieceGeometryBank {
  const geometries: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  // Shared soft contact shadow disc on board surface
  const shadowDiscGeo = track(new THREE.PlaneGeometry(0.86, 0.86));
  shadowDiscGeo.rotateX(-Math.PI / 2);
  shadowDiscGeo.translate(0, 0.002, 0);

  // Shared bottom felt base disc (y = 0 to 0.03)
  const feltBaseGeo = track(new THREE.CylinderGeometry(0.32, 0.325, 0.03, 28));
  feltBaseGeo.translate(0, 0.015, 0);

  if (design === "modern_metal") {
    // Sleek architectural faceted/turned minimalist pieces
    const pedBase = track(new THREE.CylinderGeometry(0.28, 0.32, 0.14, 16));
    pedBase.translate(0, 0.095, 0);

    const pawnStem = track(new THREE.CylinderGeometry(0.11, 0.2, 0.42, 16));
    pawnStem.translate(0, 0.36, 0);
    const pawnHead = track(new THREE.SphereGeometry(0.15, 20, 16));
    pawnHead.translate(0, 0.66, 0);
    const pawnRing = track(new THREE.TorusGeometry(0.14, 0.022, 10, 24));
    pawnRing.rotateX(Math.PI / 2);
    pawnRing.translate(0, 0.56, 0);

    const rookBody = track(new THREE.CylinderGeometry(0.2, 0.24, 0.68, 8));
    rookBody.translate(0, 0.5, 0);
    const rookCap = track(new THREE.CylinderGeometry(0.22, 0.2, 0.1, 8));
    rookCap.translate(0, 0.88, 0);
    const rookMerlon = track(new THREE.BoxGeometry(0.085, 0.11, 0.085));

    const bishopBody = track(new THREE.CylinderGeometry(0.09, 0.22, 0.78, 16));
    bishopBody.translate(0, 0.54, 0);
    const bishopRing = track(new THREE.TorusGeometry(0.16, 0.025, 10, 24));
    bishopRing.rotateX(Math.PI / 2.6);
    bishopRing.translate(0, 0.88, 0);
    const bishopOrb = track(new THREE.OctahedronGeometry(0.1, 0));
    bishopOrb.translate(0, 1.03, 0);

    const knightPed = track(new THREE.CylinderGeometry(0.18, 0.24, 0.28, 16));
    knightPed.translate(0, 0.3, 0);
    const knightShape = new THREE.Shape();
    knightShape.moveTo(-0.15, 0);
    knightShape.lineTo(0.14, 0);
    knightShape.lineTo(0.16, 0.26);
    knightShape.lineTo(0.08, 0.52);
    knightShape.lineTo(0.22, 0.62);
    knightShape.lineTo(0.18, 0.74);
    knightShape.lineTo(-0.04, 0.82);
    knightShape.lineTo(-0.16, 0.62);
    knightShape.lineTo(-0.19, 0.25);
    knightShape.closePath();
    const knightBlade = track(
      new THREE.ExtrudeGeometry(knightShape, {
        depth: 0.26,
        bevelEnabled: true,
        bevelSize: 0.04,
        bevelThickness: 0.055,
        bevelSegments: 3,
      }),
    );
    knightBlade.translate(0, 0.34, -0.13);
    knightBlade.rotateY(Math.PI / 2);
    knightBlade.computeVertexNormals();

    const queenBody = track(new THREE.CylinderGeometry(0.14, 0.24, 0.92, 16));
    queenBody.translate(0, 0.61, 0);
    const queenHalo = track(new THREE.TorusGeometry(0.21, 0.025, 12, 24));
    queenHalo.rotateX(Math.PI / 2);
    queenHalo.translate(0, 1.08, 0);
    const queenGem = track(new THREE.OctahedronGeometry(0.11, 1));
    queenGem.translate(0, 1.22, 0);

    const kingBody = track(new THREE.CylinderGeometry(0.16, 0.25, 1.04, 16));
    kingBody.translate(0, 0.67, 0);
    const kingCollar = track(new THREE.CylinderGeometry(0.22, 0.18, 0.1, 16));
    kingCollar.translate(0, 1.2, 0);
    const crossV = track(new THREE.BoxGeometry(0.065, 0.25, 0.065));
    crossV.translate(0, 1.36, 0);
    const crossH = track(new THREE.BoxGeometry(0.19, 0.065, 0.065));
    crossH.translate(0, 1.39, 0);

    const buildPiece = (
      type: PieceSymbol,
      color: Color,
      palette: PieceMaterialPalette,
      square?: Square,
    ) => {
      const g = new THREE.Group();
      const mat = color === "w" ? palette.whiteMain : palette.blackMain;
      const trim = color === "w" ? palette.whiteTrim : palette.blackTrim;
      const felt = color === "w" ? palette.whiteFelt : palette.blackFelt;

      const feltMesh = new THREE.Mesh(feltBaseGeo, felt);
      const baseMesh = new THREE.Mesh(pedBase, mat);
      g.add(feltMesh, baseMesh);

      if (type === "p") {
        g.add(
          new THREE.Mesh(pawnStem, mat),
          new THREE.Mesh(pawnRing, trim),
          new THREE.Mesh(pawnHead, mat),
        );
      } else if (type === "r") {
        g.add(new THREE.Mesh(rookBody, mat), new THREE.Mesh(rookCap, trim));
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          const m = new THREE.Mesh(rookMerlon, mat);
          m.position.set(Math.cos(a) * 0.15, 0.97, Math.sin(a) * 0.15);
          m.rotation.y = -a;
          g.add(m);
        }
      } else if (type === "b") {
        g.add(
          new THREE.Mesh(bishopBody, mat),
          new THREE.Mesh(bishopRing, trim),
          new THREE.Mesh(bishopOrb, trim),
        );
      } else if (type === "n") {
        const blade = new THREE.Mesh(knightBlade, mat);
        // After rotateY(Math.PI / 2), snout points toward -Z (White faces Black at 0, Black faces White at Math.PI)
        const yawOffset = square ? (square[0] <= "d" ? -0.21 : 0.21) * (color === "w" ? 1 : -1) : 0;
        blade.rotation.y = (color === "w" ? 0 : Math.PI) + yawOffset;
        g.add(new THREE.Mesh(knightPed, trim), blade);
      } else if (type === "q") {
        g.add(
          new THREE.Mesh(queenBody, mat),
          new THREE.Mesh(queenHalo, trim),
          new THREE.Mesh(queenGem, trim),
        );
      } else if (type === "k") {
        g.add(
          new THREE.Mesh(kingBody, mat),
          new THREE.Mesh(kingCollar, trim),
          new THREE.Mesh(crossV, trim),
          new THREE.Mesh(crossH, trim),
        );
      }

      g.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      const shadowDisc = new THREE.Mesh(shadowDiscGeo, palette.contactShadowMat);
      shadowDisc.castShadow = false;
      shadowDisc.receiveShadow = false;
      g.add(shadowDisc);
      return g;
    };

    return {
      design,
      geometries,
      buildPiece,
      dispose: () => geometries.forEach((g) => g.dispose()),
    };
  }

  // Classic Handcrafted Staunton (for staunton_wood & staunton_marble)
  const pawnLathe = track(
    makeLathe([
      [0.31, 0.03],
      [0.32, 0.08],
      [0.28, 0.13],
      [0.24, 0.16],
      [0.25, 0.2],
      [0.16, 0.25],
      [0.12, 0.42],
      [0.105, 0.52],
      [0.18, 0.55],
      [0.175, 0.59],
      [0.105, 0.61],
      [0.155, 0.72],
      [0.145, 0.82],
      [0.08, 0.89],
      [0.0, 0.91],
    ]),
  );

  const rookLathe = track(
    makeLathe([
      [0.33, 0.03],
      [0.34, 0.09],
      [0.29, 0.14],
      [0.24, 0.18],
      [0.26, 0.22],
      [0.21, 0.28],
      [0.185, 0.58],
      [0.175, 0.72],
      [0.245, 0.79],
      [0.255, 0.91],
      [0.16, 0.91],
      [0.16, 0.85],
      [0.0, 0.85],
    ]),
  );
  const rookBattlement = track(new THREE.BoxGeometry(0.095, 0.1, 0.075));

  const bishopLathe = track(
    makeLathe([
      [0.33, 0.03],
      [0.34, 0.09],
      [0.29, 0.14],
      [0.24, 0.18],
      [0.25, 0.22],
      [0.15, 0.3],
      [0.115, 0.54],
      [0.11, 0.68],
      [0.19, 0.72],
      [0.185, 0.76],
      [0.12, 0.79],
      [0.18, 0.94],
      [0.165, 1.07],
      [0.09, 1.18],
      [0.025, 1.22],
      [0.0, 1.22],
    ]),
  );
  const bishopFinial = track(new THREE.SphereGeometry(0.055, 16, 12));
  bishopFinial.translate(0, 1.26, 0);
  const bishopMitreNotch = track(new THREE.BoxGeometry(0.28, 0.035, 0.045));
  bishopMitreNotch.rotateZ(0.55);
  bishopMitreNotch.translate(0.05, 1.04, 0);

  const queenLathe = track(
    makeLathe([
      [0.35, 0.03],
      [0.36, 0.1],
      [0.31, 0.16],
      [0.26, 0.2],
      [0.275, 0.24],
      [0.17, 0.34],
      [0.13, 0.64],
      [0.125, 0.84],
      [0.21, 0.89],
      [0.205, 0.94],
      [0.145, 0.97],
      [0.215, 1.16],
      [0.24, 1.27],
      [0.14, 1.27],
      [0.11, 1.33],
      [0.0, 1.35],
    ]),
  );
  const queenPearl = track(new THREE.SphereGeometry(0.042, 12, 10));
  const queenTopOrb = track(new THREE.SphereGeometry(0.068, 16, 12));
  queenTopOrb.translate(0, 1.39, 0);

  const kingLathe = track(
    makeLathe([
      [0.36, 0.03],
      [0.37, 0.1],
      [0.32, 0.17],
      [0.27, 0.21],
      [0.285, 0.26],
      [0.18, 0.36],
      [0.14, 0.72],
      [0.135, 0.94],
      [0.225, 0.99],
      [0.22, 1.04],
      [0.155, 1.07],
      [0.225, 1.29],
      [0.235, 1.37],
      [0.14, 1.42],
      [0.0, 1.43],
    ]),
  );
  const kingCrossV = track(new THREE.BoxGeometry(0.065, 0.23, 0.055));
  kingCrossV.translate(0, 1.54, 0);
  const kingCrossH = track(new THREE.BoxGeometry(0.18, 0.065, 0.055));
  kingCrossH.translate(0, 1.57, 0);

  // Sculpted 3D Weighted Staunton Knight: turned pedestal + thick beveled horse head + chest breastplate + dorsal mane + twin ears
  const knightBase = track(
    makeLathe([
      [0.33, 0.03],
      [0.34, 0.09],
      [0.29, 0.15],
      [0.24, 0.19],
      [0.255, 0.235],
      [0.215, 0.295],
      [0.0, 0.3],
    ]),
  );

  const horseShape = new THREE.Shape();
  horseShape.moveTo(-0.19, 0);
  horseShape.lineTo(0.19, 0);
  horseShape.quadraticCurveTo(0.21, 0.19, 0.1, 0.35);
  horseShape.quadraticCurveTo(0.25, 0.42, 0.31, 0.5); // jawline & muzzle
  horseShape.quadraticCurveTo(0.32, 0.55, 0.25, 0.61); // snout & nostrils
  horseShape.quadraticCurveTo(0.14, 0.69, 0.04, 0.79); // forehead bridge
  horseShape.quadraticCurveTo(-0.02, 0.83, -0.09, 0.78); // crown
  horseShape.quadraticCurveTo(-0.23, 0.62, -0.25, 0.36); // arched mane spine
  horseShape.quadraticCurveTo(-0.23, 0.16, -0.19, 0);
  horseShape.closePath();

  const knightHeadGeo = track(
    new THREE.ExtrudeGeometry(horseShape, {
      depth: 0.3,
      bevelEnabled: true,
      bevelSize: 0.052,
      bevelThickness: 0.095,
      bevelSegments: 5,
      curveSegments: 16,
    }),
  );
  knightHeadGeo.translate(0, 0.26, -0.15);
  knightHeadGeo.rotateY(Math.PI / 2); // snout now points along -Z
  knightHeadGeo.computeVertexNormals();

  // Proud rounded chest breastplate blending turned collar into sculpted torso
  const knightChestGeo = track(new THREE.SphereGeometry(0.18, 18, 14));
  knightChestGeo.scale(1.18, 1.32, 0.92);
  knightChestGeo.translate(0, 0.45, -0.06);

  // Carved dorsal mane ridge down the +Z spine
  const maneCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.05, 0.05),
    new THREE.Vector3(0, 0.86, 0.21),
    new THREE.Vector3(0, 0.62, 0.255),
    new THREE.Vector3(0, 0.37, 0.19),
  ]);
  const knightManeGeo = track(new THREE.TubeGeometry(maneCurve, 18, 0.062, 10, false));
  knightManeGeo.scale(0.82, 1.0, 1.08);

  // Sculpted tapered ear geometry
  const knightEarGeo = track(new THREE.ConeGeometry(0.058, 0.165, 10));

  const buildPiece = (
    type: PieceSymbol,
    color: Color,
    palette: PieceMaterialPalette,
    square?: Square,
  ) => {
    const g = new THREE.Group();
    const mat = color === "w" ? palette.whiteMain : palette.blackMain;
    const trim = color === "w" ? palette.whiteTrim : palette.blackTrim;
    const felt = color === "w" ? palette.whiteFelt : palette.blackFelt;

    g.add(new THREE.Mesh(feltBaseGeo, felt));

    if (type === "p") {
      g.add(new THREE.Mesh(pawnLathe, mat));
    } else if (type === "r") {
      g.add(new THREE.Mesh(rookLathe, mat));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const m = new THREE.Mesh(rookBattlement, mat);
        m.position.set(Math.cos(a) * 0.205, 0.955, Math.sin(a) * 0.205);
        m.rotation.y = -a + Math.PI / 2;
        g.add(m);
      }
    } else if (type === "b") {
      g.add(
        new THREE.Mesh(bishopLathe, mat),
        new THREE.Mesh(bishopFinial, mat),
        new THREE.Mesh(bishopMitreNotch, trim),
      );
    } else if (type === "n") {
      const headGroup = new THREE.Group();
      const head = new THREE.Mesh(knightHeadGeo, mat);
      const chest = new THREE.Mesh(knightChestGeo, mat);
      const mane = new THREE.Mesh(knightManeGeo, mat);

      const leftEar = new THREE.Mesh(knightEarGeo, mat);
      leftEar.position.set(-0.088, 1.09, 0.035);
      leftEar.rotation.set(-0.24, 0, 0.16);

      const rightEar = new THREE.Mesh(knightEarGeo, mat);
      rightEar.position.set(0.088, 1.09, 0.035);
      rightEar.rotation.set(-0.24, 0, -0.16);

      headGroup.add(head, chest, mane, leftEar, rightEar);
      // After rotateY(Math.PI / 2), snout faces -Z:
      // White faces -Z (0 rad) angled ~12deg inward toward board center;
      // Black faces +Z (Math.PI rad) angled ~12deg inward toward board center.
      const yawOffset = square ? (square[0] <= "d" ? -0.21 : 0.21) * (color === "w" ? 1 : -1) : 0;
      headGroup.rotation.y = (color === "w" ? 0 : Math.PI) + yawOffset;
      g.add(new THREE.Mesh(knightBase, mat), headGroup);
    } else if (type === "q") {
      g.add(new THREE.Mesh(queenLathe, mat), new THREE.Mesh(queenTopOrb, mat));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const p = new THREE.Mesh(queenPearl, trim);
        p.position.set(Math.cos(a) * 0.215, 1.3, Math.sin(a) * 0.215);
        g.add(p);
      }
    } else if (type === "k") {
      g.add(
        new THREE.Mesh(kingLathe, mat),
        new THREE.Mesh(kingCrossV, trim),
        new THREE.Mesh(kingCrossH, trim),
      );
    }

    g.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    const shadowDisc = new THREE.Mesh(shadowDiscGeo, palette.contactShadowMat);
    shadowDisc.castShadow = false;
    shadowDisc.receiveShadow = false;
    g.add(shadowDisc);
    return g;
  };

  return {
    design,
    geometries,
    buildPiece,
    dispose: () => geometries.forEach((g) => g.dispose()),
  };
}
