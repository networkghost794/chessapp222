import * as THREE from "three";
import type { Color } from "chess.js";
import type { ClockSide3D, ClockStyle3DId } from "@/lib/settings";
import { formatClockDisplay } from "@/lib/timeControls";
import {
  createWoodTexture,
  drawAnalogDial,
  drawDigitalClockScreen,
  drawVintageLedStrip,
} from "./proceduralTextures";

export interface ChessClockUpdateState {
  whiteMs: number | null;
  blackMs: number | null;
  activeSide: Color;
  playerSide: Color;
  needsPunch: boolean;
  flipped: boolean;
  clockSide: ClockSide3D;
  isGameOver: boolean;
}

export interface ChessClockController {
  group: THREE.Group;
  style: ClockStyle3DId;
  update: (dt: number, state: ChessClockUpdateState, elapsedSec: number) => void;
  getInteractiveMeshes: () => THREE.Object3D[];
  dispose: () => void;
}

export function createChessClock3D(style: ClockStyle3DId, anisotropy = 4): ChessClockController {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const interactiveMeshes: THREE.Object3D[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    return t;
  };

  let rockerTarget = -1; // -1 left side up (rotation.z = -0.15), +1 right side up (rotation.z = +0.15)
  let rockerCurrent = -1;
  let lastRenderKey = "";

  // Analog refs
  let leftDialCanvas: HTMLCanvasElement | null = null;
  let rightDialCanvas: HTMLCanvasElement | null = null;
  let leftDialTex: THREE.CanvasTexture | null = null;
  let rightDialTex: THREE.CanvasTexture | null = null;
  let vintageLedCanvas: HTMLCanvasElement | null = null;
  let vintageLedTex: THREE.CanvasTexture | null = null;
  let leftPlunger: THREE.Group | null = null;
  let rightPlunger: THREE.Group | null = null;
  let leftPlungerGlowMat: THREE.MeshStandardMaterial | null = null;
  let rightPlungerGlowMat: THREE.MeshStandardMaterial | null = null;

  // Digital refs
  let digitalCanvas: HTMLCanvasElement | null = null;
  let digitalTex: THREE.CanvasTexture | null = null;
  let digitalRocker: THREE.Group | null = null;
  let leftWingMat: THREE.MeshPhysicalMaterial | null = null;
  let rightWingMat: THREE.MeshPhysicalMaterial | null = null;

  // Rubberized plinth pad so angled clock rests flush on table
  const baseFoot = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(2.18, 0.04, 0.72)),
    trackMat(new THREE.MeshStandardMaterial({ color: "#14161a", roughness: 0.85 })),
  );
  baseFoot.position.y = -0.02;
  group.add(baseFoot);

  if (style === "analog_vintage") {
    const walnutTex = trackTex(
      createWoodTexture("#8b5632", "#4f2c15", {
        seed: 88,
        streaks: 55,
        birdseye: true,
        anisotropy,
      }),
    );
    const faceTex = trackTex(
      createWoodTexture("#dfceb4", "#bca683", {
        seed: 91,
        streaks: 65,
        birdseye: false,
        anisotropy,
      }),
    );

    const caseMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        map: walnutTex,
        roughness: 0.32,
        metalness: 0.03,
        clearcoat: 0.36,
        clearcoatRoughness: 0.22,
      }),
    );
    const faceMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: faceTex,
        roughness: 0.45,
        metalness: 0.02,
      }),
    );
    const bezelMat = trackMat(
      new THREE.MeshStandardMaterial({ color: "#b58e49", roughness: 0.28, metalness: 0.75 }),
    );
    const collarMat = trackMat(
      new THREE.MeshStandardMaterial({ color: "#34383f", roughness: 0.35, metalness: 0.6 }),
    );

    leftPlungerGlowMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: "#e6eaef",
        roughness: 0.16,
        metalness: 0.9,
        emissive: new THREE.Color("#f59e0b"),
        emissiveIntensity: 0,
      }),
    );
    rightPlungerGlowMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: "#e6eaef",
        roughness: 0.16,
        metalness: 0.9,
        emissive: new THREE.Color("#f59e0b"),
        emissiveIntensity: 0,
      }),
    );

    const body = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.26, 1.24, 0.58)), caseMat);
    body.position.y = 0.62;
    body.castShadow = true;
    body.receiveShadow = true;
    interactiveMeshes.push(body);
    group.add(body);

    const face = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.02, 1.02, 0.03)), faceMat);
    face.position.set(0, 0.62, 0.295);
    face.receiveShadow = true;
    group.add(face);

    // Top chrome/brass plungers with dark collar rings
    const collarGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.15, 0.03, 24));
    const stemGeo = trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 16));
    const capGeo = trackGeo(new THREE.CylinderGeometry(0.125, 0.11, 0.065, 24));

    const makePlunger = (x: number, mat: THREE.MeshStandardMaterial) => {
      const collar = new THREE.Mesh(collarGeo, collarMat);
      collar.position.set(x, 1.255, 0);
      group.add(collar);

      const plungerGroup = new THREE.Group();
      plungerGroup.position.set(x, 1.38, 0);
      const cap = new THREE.Mesh(capGeo, mat);
      const stem = new THREE.Mesh(stemGeo, mat);
      stem.position.y = -0.09;
      cap.castShadow = true;
      stem.castShadow = true;
      plungerGroup.add(cap, stem);
      interactiveMeshes.push(cap, stem);
      group.add(plungerGroup);
      return plungerGroup;
    };
    leftPlunger = makePlunger(-0.68, leftPlungerGlowMat);
    rightPlunger = makePlunger(0.68, rightPlungerGlowMat);

    leftDialCanvas = document.createElement("canvas");
    leftDialCanvas.width = 512;
    leftDialCanvas.height = 512;
    leftDialTex = trackTex(new THREE.CanvasTexture(leftDialCanvas));
    leftDialTex.colorSpace = THREE.SRGBColorSpace;
    leftDialTex.anisotropy = anisotropy;

    rightDialCanvas = document.createElement("canvas");
    rightDialCanvas.width = 512;
    rightDialCanvas.height = 512;
    rightDialTex = trackTex(new THREE.CanvasTexture(rightDialCanvas));
    rightDialTex.colorSpace = THREE.SRGBColorSpace;
    rightDialTex.anisotropy = anisotropy;

    const dialGeo = trackGeo(new THREE.CircleGeometry(0.34, 40));
    const bezelGeo = trackGeo(new THREE.TorusGeometry(0.35, 0.028, 14, 42));
    const glassGeo = trackGeo(new THREE.CircleGeometry(0.342, 40));
    const glassMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.04,
        depthWrite: false,
        roughness: 0.25,
        metalness: 0,
        clearcoat: 0.35,
      }),
    );

    const mountDial = (x: number, tex: THREE.CanvasTexture) => {
      const dialMat = trackMat(new THREE.MeshBasicMaterial({ map: tex }));
      const dial = new THREE.Mesh(dialGeo, dialMat);
      dial.position.set(x, 0.72, 0.314);
      const bezel = new THREE.Mesh(bezelGeo, bezelMat);
      bezel.position.set(x, 0.72, 0.318);
      const glass = new THREE.Mesh(glassGeo, glassMat);
      glass.position.set(x, 0.72, 0.324);
      interactiveMeshes.push(dial);
      group.add(dial, bezel, glass);
    };

    mountDial(-0.5, leftDialTex);
    mountDial(0.5, rightDialTex);

    // Lower front dual LED/LCD readout strip for exact MM:SS clarity
    vintageLedCanvas = document.createElement("canvas");
    vintageLedCanvas.width = 768;
    vintageLedCanvas.height = 128;
    vintageLedTex = trackTex(new THREE.CanvasTexture(vintageLedCanvas));
    vintageLedTex.colorSpace = THREE.SRGBColorSpace;
    vintageLedTex.anisotropy = anisotropy;

    const ledMesh = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(1.78, 0.25)),
      trackMat(new THREE.MeshBasicMaterial({ map: vintageLedTex })),
    );
    ledMesh.position.set(0, 0.24, 0.315);
    interactiveMeshes.push(ledMesh);
    group.add(ledMesh);
  } else {
    // DGT 2010 / 3000-style Digital Tournament Clock
    // Built in (Z, Y) profile rotated -Math.PI/2 around Y so +X -> +Z (FRONT) cleanly!
    const sideProfile = new THREE.Shape();
    sideProfile.moveTo(-0.44, 0);
    sideProfile.lineTo(0.44, 0);
    sideProfile.lineTo(0.44, 0.08);
    sideProfile.lineTo(0.14, 0.72);
    sideProfile.lineTo(-0.36, 0.8);
    sideProfile.lineTo(-0.44, 0.68);
    sideProfile.closePath();

    const bodyGeo = trackGeo(
      new THREE.ExtrudeGeometry(sideProfile, {
        depth: 2.36,
        bevelEnabled: true,
        bevelSize: 0.03,
        bevelThickness: 0.03,
        bevelSegments: 3,
      }),
    );
    bodyGeo.translate(0, 0, -1.18);
    bodyGeo.rotateY(-Math.PI / 2); // CRITICAL: +X in sideProfile now points to +Z (FRONT)

    const redPlastic = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: "#b81d25",
        roughness: 0.32,
        metalness: 0.04,
        clearcoat: 0.45,
        clearcoatRoughness: 0.22,
      }),
    );
    const darkTrim = trackMat(
      new THREE.MeshStandardMaterial({ color: "#191d22", roughness: 0.48, metalness: 0.15 }),
    );
    const buttonMat = trackMat(
      new THREE.MeshStandardMaterial({ color: "#3d424a", roughness: 0.45, metalness: 0.15 }),
    );
    leftWingMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: "#f4f2eb",
        roughness: 0.26,
        metalness: 0.02,
        clearcoat: 0.3,
        emissive: new THREE.Color("#f59e0b"),
        emissiveIntensity: 0,
      }),
    );
    rightWingMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: "#f4f2eb",
        roughness: 0.26,
        metalness: 0.02,
        clearcoat: 0.3,
        emissive: new THREE.Color("#f59e0b"),
        emissiveIntensity: 0,
      }),
    );

    const bodyMesh = new THREE.Mesh(bodyGeo, redPlastic);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    interactiveMeshes.push(bodyMesh);
    group.add(bodyMesh);

    // Front LCD display holder sits ON TOP of the +Z front slope (rotation.x = -0.438 rad)
    const frontHolder = new THREE.Group();
    frontHolder.position.set(0, 0.42, 0.315);
    frontHolder.rotation.x = -0.438;
    group.add(frontHolder);

    const bezel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.06, 0.58, 0.032)), darkTrim);
    bezel.position.set(0, 0, 0.016);
    frontHolder.add(bezel);

    // 512x256 dynamic olive-grey DGT LCD canvas
    digitalCanvas = document.createElement("canvas");
    digitalCanvas.width = 512;
    digitalCanvas.height = 256;
    digitalTex = trackTex(new THREE.CanvasTexture(digitalCanvas));
    digitalTex.colorSpace = THREE.SRGBColorSpace;
    digitalTex.anisotropy = anisotropy;

    const screenMesh = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(1.94, 0.42)),
      trackMat(new THREE.MeshBasicMaterial({ map: digitalTex })),
    );
    screenMesh.position.set(0, 0.055, 0.036);
    interactiveMeshes.push(screenMesh);
    frontHolder.add(screenMesh);

    // Bottom tactile tournament buttons below LCD
    const btnGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.075, 0.025));
    for (let i = 0; i < 5; i++) {
      const btn = new THREE.Mesh(btnGeo, buttonMat);
      btn.position.set(-0.76 + i * 0.38, -0.22, 0.028);
      frontHolder.add(btn);
    }

    // Recessed top rocker spine groove + center pivot
    const spineGroove = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.22, 0.04, 0.46)), darkTrim);
    spineGroove.position.set(0, 0.79, -0.12);
    group.add(spineGroove);

    // Prominent Seesaw Lever Bar along the top spine
    digitalRocker = new THREE.Group();
    digitalRocker.position.set(0, 0.87, -0.12);

    const leftWing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.04, 0.11, 0.4)), leftWingMat);
    leftWing.position.set(-0.54, 0.02, 0);
    leftWing.castShadow = true;

    const rightWing = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.04, 0.11, 0.4)),
      rightWingMat,
    );
    rightWing.position.set(0.54, 0.02, 0);
    rightWing.castShadow = true;

    const centerBridge = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.16, 0.09, 0.36)),
      darkTrim,
    );
    centerBridge.position.set(0, 0.01, 0);

    interactiveMeshes.push(leftWing, rightWing);
    digitalRocker.add(leftWing, rightWing, centerBridge);
    group.add(digitalRocker);
  }

  const resolveSides = (flipped: boolean, clockSide: ClockSide3D) => {
    const nearSide: Color = flipped ? "b" : "w";
    const farSide: Color = flipped ? "w" : "b";
    return {
      leftSide: clockSide === "right" ? farSide : nearSide,
      rightSide: clockSide === "right" ? nearSide : farSide,
    };
  };

  const refreshFaces = (state: ChessClockUpdateState, blinkColon: boolean) => {
    const { whiteMs, blackMs, activeSide, flipped, clockSide, needsPunch } = state;
    const { leftSide, rightSide } = resolveSides(flipped, clockSide);

    if (
      style === "analog_vintage" &&
      leftDialCanvas &&
      rightDialCanvas &&
      leftDialTex &&
      rightDialTex
    ) {
      drawAnalogDial(
        leftDialCanvas.getContext("2d")!,
        leftDialCanvas.width,
        leftSide === "w" ? whiteMs : blackMs,
        activeSide === leftSide,
        leftSide === "w" ? "white" : "black",
      );
      drawAnalogDial(
        rightDialCanvas.getContext("2d")!,
        rightDialCanvas.width,
        rightSide === "w" ? whiteMs : blackMs,
        activeSide === rightSide,
        rightSide === "w" ? "white" : "black",
      );
      leftDialTex.needsUpdate = true;
      rightDialTex.needsUpdate = true;

      if (vintageLedCanvas && vintageLedTex) {
        drawVintageLedStrip(
          vintageLedCanvas.getContext("2d")!,
          vintageLedCanvas.width,
          vintageLedCanvas.height,
          whiteMs,
          blackMs,
          activeSide,
          flipped,
          needsPunch,
          clockSide,
        );
        vintageLedTex.needsUpdate = true;
      }
    } else if (style === "digital_tournament" && digitalCanvas && digitalTex) {
      drawDigitalClockScreen(
        digitalCanvas.getContext("2d")!,
        digitalCanvas.width,
        digitalCanvas.height,
        whiteMs,
        blackMs,
        activeSide,
        flipped,
        needsPunch,
        blinkColon,
        clockSide,
      );
      digitalTex.needsUpdate = true;
    }
  };

  // Immediately draw initial face textures so frame 0 is crisp and never blank
  refreshFaces(
    {
      whiteMs: null,
      blackMs: null,
      activeSide: "w",
      playerSide: "w",
      needsPunch: false,
      flipped: false,
      clockSide: "right",
      isGameOver: false,
    },
    true,
  );

  return {
    group,
    style,
    getInteractiveMeshes() {
      return interactiveMeshes;
    },
    update(dt, state, elapsedSec) {
      const {
        activeSide,
        playerSide,
        needsPunch,
        flipped,
        clockSide,
        whiteMs,
        blackMs,
        isGameOver,
      } = state;
      const { leftSide } = resolveSides(flipped, clockSide);

      // -1 => left side UP (rotation.z = -0.15), +1 => right side UP (rotation.z = +0.15)
      rockerTarget = activeSide === leftSide ? -1 : 1;
      rockerCurrent = THREE.MathUtils.damp(rockerCurrent, rockerTarget, 16, dt);

      const pulseGlow = needsPunch ? 0.45 + 0.35 * Math.sin(elapsedSec * 7.5) : 0;
      const humanIsLeft = playerSide === leftSide;

      if (style === "analog_vintage" && leftPlunger && rightPlunger) {
        const t = (rockerCurrent + 1) * 0.5;
        leftPlunger.position.y = THREE.MathUtils.lerp(1.4, 1.28, t);
        rightPlunger.position.y = THREE.MathUtils.lerp(1.28, 1.4, t);

        if (leftPlungerGlowMat && rightPlungerGlowMat) {
          leftPlungerGlowMat.emissiveIntensity = humanIsLeft ? pulseGlow : 0;
          rightPlungerGlowMat.emissiveIntensity = !humanIsLeft ? pulseGlow : 0;
        }
      } else if (style === "digital_tournament" && digitalRocker) {
        digitalRocker.rotation.z = rockerCurrent * 0.15;
        if (leftWingMat && rightWingMat) {
          leftWingMat.emissiveIntensity = humanIsLeft ? pulseGlow * 0.85 : 0;
          rightWingMat.emissiveIntensity = !humanIsLeft ? pulseGlow * 0.85 : 0;
        }
      }

      const wStr = formatClockDisplay(whiteMs);
      const bStr = formatClockDisplay(blackMs);
      const blinkColon = needsPunch || isGameOver ? true : Math.floor(elapsedSec * 2) % 2 === 0;
      const renderKey = `${wStr}|${bStr}|${activeSide}|${flipped}|${clockSide}|${needsPunch}|${blinkColon}`;
      if (renderKey !== lastRenderKey) {
        lastRenderKey = renderKey;
        refreshFaces(state, blinkColon);
      }
    },
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
