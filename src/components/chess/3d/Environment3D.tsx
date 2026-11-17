import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Environment3DId, GraphicsQuality3D } from "@/lib/settings";
import { createWoodTexture } from "./proceduralTextures";

export interface Environment3DController {
  envId: Environment3DId;
  group: THREE.Group;
  applyToScene: (
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    quality: GraphicsQuality3D,
    isSoftwareGl: boolean,
  ) => void;
  dispose: () => void;
}

export function createEnvironment3D(
  envId: Environment3DId,
  quality: GraphicsQuality3D,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  isSoftwareGl: boolean,
  anisotropy = 4,
): Environment3DController {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  let envRT: THREE.WebGLRenderTarget | null = null;

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

  // Three-point lighting + hemisphere fill
  const hemi = new THREE.HemisphereLight(0xffffff, 0x3b2a1e, 0.75);
  const keyLight = new THREE.DirectionalLight(0xfff1dc, 1.8);
  const fillLight = new THREE.DirectionalLight(0xc2d8ff, 0.55);
  const rimLight = new THREE.DirectionalLight(0xffdfb0, 0.65);

  group.add(hemi, keyLight, fillLight, rimLight, keyLight.target);
  keyLight.target.position.set(0.4, 0, 0);

  const enableShadows = !isSoftwareGl && quality !== "low";
  const shadowRes = quality === "high" ? 2048 : 1024;
  keyLight.castShadow = enableShadows;
  if (enableShadows) {
    keyLight.shadow.mapSize.set(shadowRes, shadowRes);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 32;
    keyLight.shadow.camera.left = -7.8;
    keyLight.shadow.camera.right = 7.8;
    keyLight.shadow.camera.top = 7.8;
    keyLight.shadow.camera.bottom = -7.8;
    keyLight.shadow.radius = 3.5;
    keyLight.shadow.bias = -0.00025;
    keyLight.shadow.normalBias = 0.02;
  }

  // Build environment-specific tabletop & spatial backdrop
  let bgHex = "#1a130f";
  let fogHex = "#1a130f";
  let fogNear = 18;
  let fogFar = 46;

  if (envId === "garden") {
    // Inspired by user's outdoor English Garden reference photo:
    // sunlit slatted redwood/cedar picnic table, sunlit grass lawn, evergreen hedges
    bgHex = "#7aaed4";
    fogHex = "#9cc3dc";
    fogNear = 20;
    fogFar = 58;

    hemi.color.set("#d8eeff");
    hemi.groundColor.set("#446629");
    hemi.intensity = 1.05;

    keyLight.color.set("#fff5df");
    keyLight.intensity = 2.3;
    keyLight.position.set(9, 14, 7);

    fillLight.color.set("#a6d1f7");
    fillLight.intensity = 0.6;
    fillLight.position.set(-8, 7, 5);

    rimLight.color.set("#ffe6b3");
    rimLight.intensity = 0.7;
    rimLight.position.set(-4, 6, -10);

    const cedarTex = trackTex(
      createWoodTexture("#9e4e2a", "#5f2810", { seed: 201, streaks: 90, anisotropy }),
    );
    const cedarMat = trackMat(
      new THREE.MeshStandardMaterial({ map: cedarTex, roughness: 0.62, metalness: 0.02 }),
    );

    // 7 slatted outdoor picnic table planks underneath the board & clock
    const plankGeo = trackGeo(new THREE.BoxGeometry(20, 0.45, 1.92));
    for (let i = -3; i <= 3; i++) {
      const plank = new THREE.Mesh(plankGeo, cedarMat);
      plank.position.set(0.6, -0.226, i * 2.04);
      plank.receiveShadow = true;
      group.add(plank);
    }

    // Lush sunlit garden lawn below
    const grassMat = trackMat(
      new THREE.MeshStandardMaterial({ color: "#436e2c", roughness: 0.96, metalness: 0 }),
    );
    const lawn = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(42, 48)), grassMat);
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = -4.2;
    lawn.receiveShadow = true;
    group.add(lawn);

    // Stylized background evergreen shrubs & cypress silhouettes framing the garden
    const shrubMatDark = trackMat(
      new THREE.MeshStandardMaterial({ color: "#2d5221", roughness: 0.9 }),
    );
    const shrubMatLight = trackMat(
      new THREE.MeshStandardMaterial({ color: "#4a7830", roughness: 0.88 }),
    );
    const shrubGeo = trackGeo(new THREE.DodecahedronGeometry(2.4, 1));
    const placements: Array<[number, number, number, number, boolean]> = [
      [-14, -2.2, -16, 1.4, true],
      [-7, -2.5, -18, 1.2, false],
      [2, -2.4, -19, 1.6, true],
      [11, -2.3, -17, 1.35, false],
      [17, -2.1, -12, 1.5, true],
      [-17, -2.2, -7, 1.3, false],
    ];
    for (const [x, y, z, s, light] of placements) {
      const bush = new THREE.Mesh(shrubGeo, light ? shrubMatLight : shrubMatDark);
      bush.position.set(x, y, z);
      bush.scale.set(s * 1.3, s, s * 1.1);
      group.add(bush);
    }
  } else if (envId === "club") {
    bgHex = "#0f1c16";
    fogHex = "#0f1c16";
    hemi.color.set("#d9e8dc");
    hemi.groundColor.set("#18291e");
    hemi.intensity = 0.72;

    keyLight.color.set("#ffe6be");
    keyLight.intensity = 1.95;
    keyLight.position.set(7, 11, 7);

    fillLight.color.set("#8bb4a0");
    fillLight.intensity = 0.45;
    fillLight.position.set(-7, 6, 5);

    const oakTex = trackTex(
      createWoodTexture("#2b1f18", "#170f0b", { seed: 305, streaks: 65, anisotropy }),
    );
    const tableMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        map: oakTex,
        roughness: 0.38,
        clearcoat: 0.32,
      }),
    );
    const table = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22, 0.6, 16)), tableMat);
    table.position.set(0.6, -0.301, 0);
    table.receiveShadow = true;
    group.add(table);

    // Emerald club felt table inlay surround
    const feltMat = trackMat(new THREE.MeshStandardMaterial({ color: "#194731", roughness: 0.92 }));
    const feltRing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(15.2, 0.03, 11.4)), feltMat);
    feltRing.position.set(0.9, -0.014, 0);
    feltRing.receiveShadow = true;
    group.add(feltRing);
  } else if (envId === "penthouse") {
    bgHex = "#141a26";
    fogHex = "#141a26";
    hemi.color.set("#b8ccf0");
    hemi.groundColor.set("#222630");
    hemi.intensity = 0.85;

    keyLight.color.set("#fff4e8");
    keyLight.intensity = 1.9;
    keyLight.position.set(8, 12, 6);

    fillLight.color.set("#6e8cc4");
    fillLight.intensity = 0.65;
    fillLight.position.set(-8, 6, 6);

    rimLight.color.set("#ffbe78");
    rimLight.intensity = 0.85;
    rimLight.position.set(-6, 5, -9);

    const stoneMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: "#2c313a",
        roughness: 0.28,
        metalness: 0.08,
        clearcoat: 0.45,
      }),
    );
    const table = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22, 0.65, 16)), stoneMat);
    table.position.set(0.6, -0.326, 0);
    table.receiveShadow = true;
    group.add(table);

    // Distant twilight architectural horizon glow band
    const skylineMat = trackMat(
      new THREE.MeshBasicMaterial({ color: "#222d42", side: THREE.BackSide }),
    );
    const dome = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(36, 36, 18, 32, 1, true)),
      skylineMat,
    );
    dome.position.y = 4;
    group.add(dome);
  } else if (envId === "hall") {
    bgHex = "#242830";
    fogHex = "#242830";
    hemi.color.set("#f2f4f8");
    hemi.groundColor.set("#4a3b2c");
    hemi.intensity = 0.95;

    keyLight.color.set("#ffffff");
    keyLight.intensity = 2.0;
    keyLight.position.set(6, 13, 7);

    fillLight.color.set("#dbe6f5");
    fillLight.intensity = 0.65;
    fillLight.position.set(-7, 8, 5);

    const beechTex = trackTex(
      createWoodTexture("#c49d72", "#9e774f", { seed: 411, streaks: 60, anisotropy }),
    );
    const tableMat = trackMat(
      new THREE.MeshStandardMaterial({ map: beechTex, roughness: 0.42, metalness: 0.02 }),
    );
    const table = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22, 0.6, 16)), tableMat);
    table.position.set(0.6, -0.301, 0);
    table.receiveShadow = true;
    group.add(table);
  } else {
    // Default: Manor Library (warm walnut/mahogany desk, cozy parlor light)
    bgHex = "#18110e";
    fogHex = "#18110e";
    hemi.color.set("#ffe8cc");
    hemi.groundColor.set("#2b1911");
    hemi.intensity = 0.78;

    keyLight.color.set("#ffdfba");
    keyLight.intensity = 1.95;
    keyLight.position.set(6.5, 11, 7.5);

    fillLight.color.set("#9ab5d8");
    fillLight.intensity = 0.42;
    fillLight.position.set(-7, 6, 4);

    rimLight.color.set("#ffb86b");
    rimLight.intensity = 0.7;
    rimLight.position.set(-5, 5, -8);

    const parlorTex = trackTex(
      createWoodTexture("#472b1c", "#2a160c", { seed: 109, streaks: 80, anisotropy }),
    );
    const tableMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        map: parlorTex,
        roughness: 0.36,
        clearcoat: 0.34,
        clearcoatRoughness: 0.25,
      }),
    );
    const table = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22, 0.65, 16)), tableMat);
    table.position.set(0.6, -0.326, 0);
    table.receiveShadow = true;
    group.add(table);

    // Subtle brass desk lamp accent off to upper-left corner of table
    const brassMat = trackMat(
      new THREE.MeshStandardMaterial({ color: "#caa055", roughness: 0.28, metalness: 0.85 }),
    );
    const shadeMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: "#1e5638",
        emissive: "#2f6b47",
        emissiveIntensity: 0.45,
        roughness: 0.35,
      }),
    );
    const bulbMat = trackMat(new THREE.MeshBasicMaterial({ color: "#ffe7ba" }));
    const lampBase = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.42, 0.5, 0.14, 24)),
      brassMat,
    );
    lampBase.position.set(-6.4, 0.07, -4.4);
    const lampStem = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 16)),
      brassMat,
    );
    lampStem.position.set(-6.4, 1.15, -4.4);
    const lampShade = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.32, 0.68, 0.56, 20)),
      shadeMat,
    );
    lampShade.position.set(-6.1, 2.25, -4.2);
    lampShade.rotation.z = -0.25;
    const lampBulb = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.14, 12, 12)), bulbMat);
    lampBulb.position.set(-5.95, 2.02, -4.15);

    // Warm desk lamp pool light illuminating the board and pieces
    const lampLight = new THREE.PointLight(0xffc982, 4.4, 24, 1.35);
    lampLight.position.set(-5.85, 1.95, -4.05);
    group.add(lampBase, lampStem, lampShade, lampBulb, lampLight);
  }

  const applyToScene = (
    targetScene: THREE.Scene,
    targetRenderer: THREE.WebGLRenderer,
    q: GraphicsQuality3D,
    softGl: boolean,
  ) => {
    targetScene.background = new THREE.Color(bgHex);
    targetScene.fog = new THREE.Fog(fogHex, fogNear, fogFar);
    targetRenderer.shadowMap.enabled = !softGl && q !== "low";

    if (!envRT && q !== "low") {
      const pmrem = new THREE.PMREMGenerator(targetRenderer);
      const roomEnv = new RoomEnvironment();
      envRT = pmrem.fromScene(roomEnv, 0.04);
      targetScene.environment = envRT.texture;
      targetScene.environmentIntensity = q === "high" ? 0.72 : 0.45;
      roomEnv.dispose();
      pmrem.dispose();
    } else if (q === "low") {
      targetScene.environment = null;
    }
  };

  applyToScene(scene, renderer, quality, isSoftwareGl);

  return {
    envId,
    group,
    applyToScene,
    dispose() {
      if (envRT) {
        envRT.dispose();
        envRT = null;
      }
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
