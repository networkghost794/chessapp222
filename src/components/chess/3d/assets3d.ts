import type {
  BoardMaterial3DId,
  CameraPreset3D,
  ClockStyle3DId,
  Environment3DId,
  GraphicsQuality3D,
  PieceDesign3DId,
} from "@/lib/settings";

export interface Environment3DMeta {
  id: Environment3DId;
  name: string;
  subtitle: string;
  swatchTop: string;
  swatchBottom: string;
}

export interface BoardMaterial3DMeta {
  id: BoardMaterial3DId;
  name: string;
  subtitle: string;
  lightSwatch: string;
  darkSwatch: string;
  frameSwatch: string;
  referenceImage?: string;
}

export interface PieceDesign3DMeta {
  id: PieceDesign3DId;
  name: string;
  subtitle: string;
  lightSwatch: string;
  darkSwatch: string;
}

export interface ClockStyle3DMeta {
  id: ClockStyle3DId;
  name: string;
  subtitle: string;
  accentSwatch: string;
  referenceImage?: string;
}

export interface CameraPreset3DMeta {
  id: CameraPreset3D;
  name: string;
  shortLabel: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export const ENVIRONMENTS_3D: Environment3DMeta[] = [
  {
    id: "library",
    name: "Manor Library",
    subtitle: "Warm mahogany study & lamp light",
    swatchTop: "#2c1e16",
    swatchBottom: "#5c3b24",
  },
  {
    id: "garden",
    name: "English Garden",
    subtitle: "Sunlit cedar picnic table & foliage",
    swatchTop: "#6ca6d9",
    swatchBottom: "#4c7a34",
  },
  {
    id: "club",
    name: "Luxury Chess Club",
    subtitle: "Emerald baize rim & brass glow",
    swatchTop: "#14261d",
    swatchBottom: "#1d4a35",
  },
  {
    id: "penthouse",
    name: "Modern Penthouse",
    subtitle: "Twilight skyline & smoked stone",
    swatchTop: "#1a2234",
    swatchBottom: "#384152",
  },
  {
    id: "hall",
    name: "Classic Tournament Hall",
    subtitle: "Crisp stage daylight & beech table",
    swatchTop: "#2d3138",
    swatchBottom: "#b38c64",
  },
];

export const BOARD_MATERIALS_3D: BoardMaterial3DMeta[] = [
  {
    id: "walnut",
    name: "Walnut & Maple",
    subtitle: "Double-inlaid beveled hardwood",
    lightSwatch: "#ead6b3",
    darkSwatch: "#6b4428",
    frameSwatch: "#573720",
    referenceImage: "/assets/aistudio/Screenshot_2026-11-17_111859_38e440da.png",
  },
  {
    id: "marble",
    name: "Polished Marble",
    subtitle: "Carrara white & Nero Marquina",
    lightSwatch: "#eceae4",
    darkSwatch: "#2d3238",
    frameSwatch: "#3a3f46",
  },
  {
    id: "mahogany",
    name: "Royal Mahogany",
    subtitle: "Warm reddish-brown & algebraic trim",
    lightSwatch: "#ebd9bb",
    darkSwatch: "#8b3f24",
    frameSwatch: "#78321b",
    referenceImage: "/assets/aistudio/Screenshot_2026-11-17_112140_928b3f9d.png",
  },
  {
    id: "glass",
    name: "Crystal Glass",
    subtitle: "Frosted & smoked architectural glass",
    lightSwatch: "#d8e9f2",
    darkSwatch: "#3a5163",
    frameSwatch: "#7a95a8",
  },
];

export const PIECE_DESIGNS_3D: PieceDesign3DMeta[] = [
  {
    id: "staunton_wood",
    name: "Handcrafted Wood",
    subtitle: "Weighted boxwood & rosewood with green felt",
    lightSwatch: "#ebd3a6",
    darkSwatch: "#6a3c24",
  },
  {
    id: "staunton_marble",
    name: "Carved Marble",
    subtitle: "Honed alabaster & obsidian stone",
    lightSwatch: "#f1efe9",
    darkSwatch: "#282b30",
  },
  {
    id: "modern_metal",
    name: "Modern Metal",
    subtitle: "Brushed steel & anodized gunmetal",
    lightSwatch: "#cfd6df",
    darkSwatch: "#2a2f3a",
  },
];

export const CLOCK_STYLES_3D: ClockStyle3DMeta[] = [
  {
    id: "analog_vintage",
    name: "Vintage Analog",
    subtitle: "Classic birch double-dial with flags",
    accentSwatch: "#d9b589",
    referenceImage: "/assets/aistudio/Screenshot_2026-11-17_111730_e14a6a2a.png",
  },
  {
    id: "digital_tournament",
    name: "Digital Tournament",
    subtitle: "Crimson DGT-style LCD & white rocker",
    accentSwatch: "#b8222a",
    referenceImage: "/assets/aistudio/Screenshot_2026-11-17_111634_b3c3e21c.png",
  },
];

export const CAMERA_PRESETS_3D: CameraPreset3DMeta[] = [
  {
    id: "seated_front",
    name: "Seated Player Perspective",
    shortLabel: "Seated",
    position: [0.0, 8.1, 9.35],
    target: [0.0, 0.22, 0.15],
    fov: 44,
  },
  {
    id: "perspective_angled",
    name: "Angled Tournament",
    shortLabel: "Angled",
    position: [5.4, 7.2, 8.0],
    target: [0.0, 0.25, 0.1],
    fov: 43,
  },
  {
    id: "overhead",
    name: "Overhead 3D",
    shortLabel: "Overhead",
    position: [0.0, 12.1, 2.3],
    target: [0.0, 0, 0.1],
    fov: 41,
  },
];

export const GRAPHICS_QUALITIES_3D: Array<{
  id: GraphicsQuality3D;
  name: string;
  desc: string;
}> = [
  { id: "low", name: "Low", desc: "Crisp lighting, no dynamic shadows" },
  { id: "medium", name: "Medium", desc: "Soft shadows & balanced resolution" },
  { id: "high", name: "High", desc: "Full shadows, reflections & max sharpness" },
];

export function getCameraPresetMeta(id: CameraPreset3D): CameraPreset3DMeta {
  return CAMERA_PRESETS_3D.find((c) => c.id === id) ?? CAMERA_PRESETS_3D[0];
}
