// Immersive Bot Identity Mode — purely cosmetic.
// When enabled, bots are displayed with generated "online player" usernames
// and their official titles are hidden. Nothing about bot behaviour changes.

import { useEffect, useState } from "react";

const STORAGE_KEY = "botboard-immersive";
const EVENT = "botboard-immersive-change";

export function isImmersiveEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setImmersiveEnabled(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Reactive access to the immersive toggle. */
export function useImmersive(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(isImmersiveEnabled());
    const sync = () => setEnabled(isImmersiveEnabled());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return [enabled, (v: boolean) => { setImmersiveEnabled(v); setEnabled(v); }];
}

const USERNAMES = [
  "Bradycore", "BraveBear", "CertDive", "ClashSoFlow", "Donnastream", "DukeZenith",
  "EpicMyWave", "FineFortress", "JustJuggler", "Levionic", "Mistator", "Modestreat",
  "NarrowNucleus", "OldEssence", "PapaEclipse", "QueenTrigger", "RackHunter", "RealMist",
  "RushInPop", "SavageDraco", "Skintele", "SlimMind", "Sparkzone", "Steelify",
  "Successwe", "Wayneus", "Xandower", "YummyYeti", "ZanyZebra", "Zenpro",
  "AceDoDash", "ChiefShard", "DazeTheZone", "DevotedCloud", "DreamyDoctor", "Entryad",
  "FuzzyGlory", "GlobalGrace", "Icestream", "ImmenseIron", "InfiniteMagnet", "Jacobking",
  "JumpyJolt", "Launchelli", "LostHornet", "MajorShade", "MessyCrafter", "NaughtyLaser",
  "NeonZane", "PrinceTrace", "QueenSpike", "QuickQuill", "ReplayDerp", "SpeedyRequiem",
  "StellarLotus", "UltraCrew", "Vinylva", "WaspHay", "YoungYuan", "ZenYaSnap",
  "KnightVision", "RookRaider", "SilentPawn", "BishopBlitz", "EndgameEddie", "TempoThief",
];

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Stable generated username for a bot id (same bot always gets the same name). */
export function immersiveUsername(id: string, seedName = ""): string {
  const h = hash(`${id}|${seedName}`);
  const base = USERNAMES[h % USERNAMES.length];
  const suffixMode = (h >> 8) % 3;
  if (suffixMode === 0) return base;
  if (suffixMode === 1) return `${base}${(h >> 12) % 100}`;
  return `${base}_${(h >> 16) % 1000}`;
}

export type BotIdentityLike = {
  id: string;
  name: string;
  title?: string | null;
  titleColor?: string | null;
};

/** Display identity for a bot given the immersive setting. */
export function botDisplayIdentity<T extends BotIdentityLike>(
  bot: T,
  immersive: boolean,
): { name: string; title: string | null; titleColor: string | null } {
  if (!immersive) {
    return { name: bot.name, title: bot.title ?? null, titleColor: bot.titleColor ?? null };
  }
  return { name: immersiveUsername(bot.id, bot.name), title: null, titleColor: null };
}
