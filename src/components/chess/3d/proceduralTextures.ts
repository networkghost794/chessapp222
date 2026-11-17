import * as THREE from "three";
import { formatClockDisplay } from "@/lib/timeControls";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWoodTexture(
  baseHex: string,
  grainHex: string,
  options: { seed?: number; streaks?: number; birdseye?: boolean; anisotropy?: number } = {},
): THREE.CanvasTexture {
  const { seed = 101, streaks = 70, birdseye = false, anisotropy = 4 } = options;
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rand = mulberry32(seed);

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "rgba(255,255,255,0.06)");
  grad.addColorStop(0.5, "rgba(0,0,0,0.04)");
  grad.addColorStop(1, "rgba(255,255,255,0.04)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.lineCap = "round";
  for (let i = 0; i < streaks; i++) {
    const yBase = (i / streaks) * size + (rand() - 0.5) * 8;
    const amp = 2 + rand() * 8;
    const freq = 0.008 + rand() * 0.015;
    const phase = rand() * Math.PI * 2;
    ctx.strokeStyle = grainHex;
    ctx.globalAlpha = 0.08 + rand() * 0.16;
    ctx.lineWidth = 0.8 + rand() * 2.4;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 16) {
      const y = yBase + Math.sin(x * freq + phase) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  for (let i = 0; i < 450; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 6 + rand() * 24;
    ctx.strokeStyle = grainHex;
    ctx.globalAlpha = 0.05 + rand() * 0.09;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (rand() - 0.5) * 1.4);
    ctx.stroke();
  }

  if (birdseye) {
    for (let i = 0; i < 110; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const rx = 2 + rand() * 4.5;
      const ry = 1.2 + rand() * 2.5;
      ctx.fillStyle = grainHex;
      ctx.globalAlpha = 0.18 + rand() * 0.22;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, (rand() - 0.5) * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  return tex;
}

export function createMarbleTexture(
  baseHex: string,
  veinHex: string,
  options: { seed?: number; anisotropy?: number } = {},
): THREE.CanvasTexture {
  const { seed = 307, anisotropy = 4 } = options;
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rand = mulberry32(seed);

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 24; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 40 + rand() * 120;
    const g = ctx.createRadialGradient(x, y, 4, x, y, r);
    g.addColorStop(0, "rgba(128,128,128,0.06)");
    g.addColorStop(1, "rgba(128,128,128,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  for (let v = 0; v < 18; v++) {
    let x = rand() * size;
    let y = rand() * size;
    let angle = rand() * Math.PI * 2;
    ctx.strokeStyle = veinHex;
    ctx.globalAlpha = 0.1 + rand() * 0.22;
    ctx.lineWidth = 0.6 + rand() * 2.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 18 + Math.floor(rand() * 20);
    for (let s = 0; s < steps; s++) {
      angle += (rand() - 0.5) * 0.75;
      x += Math.cos(angle) * 18;
      y += Math.sin(angle) * 18;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  return tex;
}

/**
 * Generates the top surface texture of the chessboard outer rim with mitered seams,
 * inlaid double pinstripe, and subtle engraved lowercase coordinates (a–h, 1–8)
 * hugging the interior beveled border around the 8x8 playing grid.
 */
export function createBoardFrameTexture(options: {
  frameBaseHex: string;
  frameGrainHex: string;
  inlayHex: string;
  textHex: string;
  showCoords?: boolean;
  anisotropy?: number;
}): THREE.CanvasTexture {
  const {
    frameBaseHex,
    frameGrainHex,
    inlayHex,
    textHex,
    showCoords = true,
    anisotropy = 4,
  } = options;

  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rand = mulberry32(42);

  ctx.fillStyle = frameBaseHex;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = frameGrainHex;
  for (let i = 0; i < 90; i++) {
    ctx.globalAlpha = 0.08 + rand() * 0.1;
    ctx.lineWidth = 1 + rand() * 2;
    const y = rand() * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(
      size * 0.33,
      y + (rand() - 0.5) * 18,
      size * 0.66,
      y + (rand() - 0.5) * 18,
      size,
      y,
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Inner 8x8 field maps to 8 / 9.4 of the 9.4-unit wide frame
  const outerPad = 4;
  const innerSize = (8 / 9.4) * size;
  const margin = (size - innerSize) / 2;

  // Miter seams at the 4 corners
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(outerPad, outerPad);
  ctx.lineTo(margin, margin);
  ctx.moveTo(size - outerPad, outerPad);
  ctx.lineTo(size - margin, margin);
  ctx.moveTo(outerPad, size - outerPad);
  ctx.lineTo(margin, size - margin);
  ctx.moveTo(size - outerPad, size - outerPad);
  ctx.lineTo(size - margin, size - margin);
  ctx.stroke();

  // Subtle recessed inner bevel shadow + double pinstripe inlay
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 4;
  ctx.strokeRect(margin - 2, margin - 2, innerSize + 4, innerSize + 4);

  ctx.strokeStyle = inlayHex;
  ctx.lineWidth = 2.4;
  ctx.globalAlpha = 0.85;
  ctx.strokeRect(margin - 8, margin - 8, innerSize + 16, innerSize + 16);
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.5;
  ctx.strokeRect(margin - 15, margin - 15, innerSize + 30, innerSize + 30);
  ctx.globalAlpha = 1;

  if (showCoords) {
    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
    const sqPx = innerSize / 8;
    // Positioned along the interior rim close to the inlaid trim
    const rimCoordPos = margin - 40;

    ctx.font = "600 22px ui-serif, Georgia, Cambria, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const drawEngraved = (label: string, x: number, y: number, rot = 0) => {
      ctx.save();
      ctx.translate(x, y);
      if (rot !== 0) ctx.rotate(rot);
      // Recessed engraving shadow above/left
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillText(label, -0.8, -0.8);
      // Warm highlight/inlay glyph
      ctx.fillStyle = textHex;
      ctx.globalAlpha = 0.86;
      ctx.fillText(label, 0.5, 0.5);
      ctx.restore();
    };

    for (let i = 0; i < 8; i++) {
      const cx = margin + (i + 0.5) * sqPx;
      drawEngraved(files[i], cx, size - rimCoordPos, 0);
      drawEngraved(files[i], cx, rimCoordPos, Math.PI);

      const cy = margin + (i + 0.5) * sqPx;
      drawEngraved(ranks[i], rimCoordPos, cy, 0);
      drawEngraved(ranks[i], size - rimCoordPos, cy, Math.PI);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(0,0,0,0.56)");
  grad.addColorStop(0.5, "rgba(0,0,0,0.22)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function formatClockDigits(ms: number | null): string {
  return formatClockDisplay(ms);
}

/**
 * Draws an authentic DGT 2010/3000-style dual LCD screen (512x256):
 * light olive-grey reflective LCD background, crisp dark charcoal monospace digits,
 * active turn arrow indicator, flashing colon support, and punch prompt.
 */
export function drawDigitalClockScreen(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  whiteMs: number | null,
  blackMs: number | null,
  activeSide: "w" | "b",
  flipped: boolean,
  needsPunch = false,
  blinkColon = true,
  clockSide: "left" | "right" = "right",
) {
  // Authentic olive-grey tournament LCD panel
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#b6c0a6");
  bg.addColorStop(0.5, "#aab599");
  bg.addColorStop(1, "#9ca88b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Subtle recessed inner LCD bezel shadow
  ctx.strokeStyle = "rgba(25, 32, 22, 0.45)";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, width - 4, height - 4);

  // Top header strip
  ctx.fillStyle = "rgba(25, 32, 22, 0.10)";
  ctx.fillRect(6, 6, width - 12, height * 0.22);

  // Clock on RIGHT faces inward (ry = -π/4): local left (-X) is near Rank 8 (far), local right (+X) is near Rank 1 (near).
  // Clock on LEFT faces inward (ry = +π/4): local left (-X) is near Rank 1 (near), local right (+X) is near Rank 8 (far).
  const nearSide: "w" | "b" = flipped ? "b" : "w";
  const farSide: "w" | "b" = flipped ? "w" : "b";
  const leftSide: "w" | "b" = clockSide === "right" ? farSide : nearSide;
  const rightSide: "w" | "b" = clockSide === "right" ? nearSide : farSide;
  const leftMs = leftSide === "w" ? whiteMs : blackMs;
  const rightMs = rightSide === "w" ? whiteMs : blackMs;

  const drawSideDigits = (side: "w" | "b", ms: number | null, cx: number) => {
    const isActive = activeSide === side;
    const isUrgent = ms !== null && ms < 20_000;
    const isFlagged = ms !== null && ms <= 0;
    let text = ms === null ? "∞" : formatClockDisplay(ms);
    if (isActive && !blinkColon && ms !== null && ms >= 20_000) {
      text = text.replace(":", " ");
    }

    // Highlight frame when active or awaiting punch
    if (isActive) {
      ctx.fillStyle = needsPunch
        ? "rgba(217, 119, 6, 0.26)"
        : isUrgent
          ? "rgba(185, 28, 28, 0.16)"
          : "rgba(20, 28, 18, 0.08)";
      ctx.fillRect(cx - width * 0.23, height * 0.28, width * 0.46, height * 0.64);
    }

    // Side label + active arrow indicator
    ctx.font = "800 18px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = isActive ? "#111610" : "#444d3e";
    const sideLabel = side === "w" ? "WHITE" : "BLACK";
    ctx.fillText(isActive ? `▶ ${sideLabel}` : sideLabel, cx, height * 0.16);

    // Ghost 88:88 LCD segment shadow behind active digits for realism
    ctx.font = "700 66px ui-monospace, SFMono-Regular, Menlo, monospace";
    if (ms !== null) {
      ctx.fillStyle = "rgba(22, 28, 19, 0.08)";
      ctx.fillText("88:88", cx, height * 0.56);
    }

    // Crisp primary LCD digits
    ctx.fillStyle = isFlagged
      ? "#881111"
      : isUrgent && isActive
        ? "#991b1b"
        : isActive
          ? "#10140f"
          : "#2a3126";
    ctx.fillText(text, cx, height * 0.56);

    // Bottom status bar (active running or punch prompt)
    ctx.font = "700 13px ui-sans-serif, system-ui, sans-serif";
    if (isFlagged) {
      ctx.fillStyle = "#991b1b";
      ctx.fillText("FLAG", cx, height * 0.85);
    } else if (isActive && needsPunch) {
      ctx.fillStyle = "#92400e";
      ctx.fillText("PRESS CLOCK", cx, height * 0.85);
    } else if (isActive) {
      ctx.fillStyle = "#1a2117";
      ctx.fillRect(cx - 48, height * 0.83, 96, 5);
    }
  };

  drawSideDigits(leftSide, leftMs, width * 0.25);
  drawSideDigits(rightSide, rightMs, width * 0.75);

  // Center divider
  ctx.strokeStyle = "rgba(20, 28, 18, 0.28)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width * 0.5, height * 0.26);
  ctx.lineTo(width * 0.5, height - 14);
  ctx.stroke();

  ctx.fillStyle = needsPunch ? "#92400e" : "#2e362a";
  ctx.font = "800 13px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(needsPunch ? "HIT" : "DGT", width * 0.5, height * 0.16);
}

/**
 * Draws a crisp dual LCD/LED readout strip for the front lower plate
 * of the Vintage Analog clock so exact seconds are always legible.
 */
export function drawVintageLedStrip(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  whiteMs: number | null,
  blackMs: number | null,
  activeSide: "w" | "b",
  flipped: boolean,
  needsPunch = false,
  clockSide: "left" | "right" = "right",
) {
  ctx.fillStyle = "#16191d";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#8a7042";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, width - 4, height - 4);

  const nearSide: "w" | "b" = flipped ? "b" : "w";
  const farSide: "w" | "b" = flipped ? "w" : "b";
  const leftSide: "w" | "b" = clockSide === "right" ? farSide : nearSide;
  const rightSide: "w" | "b" = clockSide === "right" ? nearSide : farSide;

  const drawEntry = (side: "w" | "b", ms: number | null, cx: number) => {
    const isActive = activeSide === side;
    const isUrgent = ms !== null && ms < 20_000;
    const digits = ms === null ? "∞" : formatClockDisplay(ms);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 18px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = isActive ? "#e2e8f0" : "#64748b";
    ctx.fillText(side === "w" ? "W" : "B", cx - 105, height * 0.52);

    ctx.font = "700 44px ui-monospace, SFMono-Regular, Menlo, monospace";
    if (isUrgent && isActive) ctx.fillStyle = "#ff5c5c";
    else if (isActive) ctx.fillStyle = needsPunch ? "#fbbf24" : "#4ade80";
    else ctx.fillStyle = "#cbd5e1";

    ctx.fillText(digits, cx + 12, height * 0.52);
  };

  drawEntry(leftSide, leftSide === "w" ? whiteMs : blackMs, width * 0.25);
  drawEntry(rightSide, rightSide === "w" ? whiteMs : blackMs, width * 0.75);

  ctx.fillStyle = needsPunch ? "#fbbf24" : "#8a7042";
  ctx.font = "800 15px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(needsPunch ? "PUNCH" : "GARDE", width * 0.5, height * 0.52);
}

/**
 * Draws a single Gardé Classic analog chess clock dial:
 * white face, bold numerals 1–12, hour/minute hands, and a red mechanical flag
 * at 12 o'clock that rotates up in the final minute and falls at 00:00.
 */
export function drawAnalogDial(
  ctx: CanvasRenderingContext2D,
  size: number,
  remainingMs: number | null,
  isActive: boolean,
  label: string,
) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.47;

  ctx.clearRect(0, 0, size, size);

  const bg = ctx.createRadialGradient(cx, cy - r * 0.15, r * 0.1, cx, cy, r);
  bg.addColorStop(0, "#ffffff");
  bg.addColorStop(1, "#eceae2");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 60; i++) {
    const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const isHour = i % 5 === 0;
    const inner = r * (isHour ? 0.82 : 0.88);
    const outer = r * 0.94;
    ctx.strokeStyle = "#181a1c";
    ctx.lineWidth = isHour ? 3.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.stroke();
  }

  ctx.fillStyle = "#111316";
  ctx.font = "700 30px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let h = 1; h <= 12; h++) {
    const angle = (h / 12) * Math.PI * 2 - Math.PI / 2;
    const nr = r * 0.7;
    ctx.fillText(String(h), cx + Math.cos(angle) * nr, cy + Math.sin(angle) * nr);
  }

  ctx.fillStyle = "#2b2f35";
  ctx.font = "700 18px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("GARDÉ", cx, cy + r * 0.26);
  ctx.font = "700 15px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = isActive ? "#15803d" : "#4b5563";
  ctx.fillText(label.toUpperCase(), cx, cy + r * 0.4);

  const effectiveMs = remainingMs ?? 5 * 60 * 1000;
  const totalSec = Math.max(0, effectiveMs / 1000);
  const isFlagged = remainingMs !== null && remainingMs <= 0;

  // Red mechanical flag at 12 o'clock (lifts up under 60s remaining, falls at 00:00)
  let flagAngle = -0.08;
  if (isFlagged) {
    flagAngle = -1.25; // fallen!
  } else if (remainingMs !== null && totalSec < 60) {
    const liftProgress = 1 - totalSec / 60; // 0 at 60s -> 1 at 0s
    flagAngle = -0.08 + liftProgress * 0.48;
  } else if (isActive) {
    flagAngle = -0.14;
  }

  const flagPivotX = cx - r * 0.14;
  const flagPivotY = cy - r * 0.75;
  ctx.save();
  ctx.translate(flagPivotX, flagPivotY);
  ctx.rotate(flagAngle);
  ctx.fillStyle = "#d12029";
  ctx.fillRect(-4, 0, 8, r * 0.34);
  ctx.beginPath();
  ctx.arc(0, r * 0.35, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Small red active propeller indicator at 3 o'clock
  const spinAngle = (totalSec % 4) * (Math.PI / 2);
  ctx.save();
  ctx.translate(cx + r * 0.44, cy + r * 0.04);
  ctx.rotate(spinAngle);
  ctx.fillStyle = isActive ? "#d92b34" : "#8b4a4d";
  for (let p = 0; p < 4; p++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(4, 0);
    ctx.lineTo(0, 4);
    ctx.lineTo(-4, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  const totalMinutes = totalSec / 60;
  const minFraction = (totalMinutes % 60) / 60;
  const minuteAngle = -Math.PI / 2 - minFraction * Math.PI * 2;
  const hourAngle = -Math.PI / 2 - ((totalMinutes / 720) % 1) * Math.PI * 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(hourAngle);
  ctx.fillStyle = "#15171a";
  ctx.beginPath();
  ctx.moveTo(-12, -4);
  ctx.lineTo(r * 0.48, -2.5);
  ctx.lineTo(r * 0.52, 0);
  ctx.lineTo(r * 0.48, 2.5);
  ctx.lineTo(-12, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(minuteAngle);
  ctx.fillStyle = "#111316";
  ctx.beginPath();
  ctx.moveTo(-16, -3.5);
  ctx.lineTo(r * 0.72, -1.8);
  ctx.lineTo(r * 0.78, 0);
  ctx.lineTo(r * 0.72, 1.8);
  ctx.lineTo(-16, 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#111316";
  ctx.beginPath();
  ctx.arc(cx, cy, 8.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8a929a";
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  ctx.fill();
}
