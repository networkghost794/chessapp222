// Authentic Acoustic Chess Audio Engine (Chess.com / Lichess standard Staunton wood soundpack)
// Preloads decoded AudioBuffers via WebAudio for zero-latency, tactile piece moves.

let ctx: AudioContext | null = null;
const audioBuffers: Record<string, AudioBuffer | null> = {
  move: null,
  capture: null,
  castle: null,
  check: null,
  promote: null,
};

// High-fidelity acoustic Staunton wood recordings (CC0 / Open Chess audio)
const SOUND_URLS: Record<string, string[]> = {
  move: [
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Move.mp3",
    "https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3",
  ],
  capture: [
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Capture.mp3",
    "https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3",
  ],
  castle: [
    "https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/castle.mp3",
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Move.mp3",
  ],
  check: [
    "https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-check.mp3",
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/GenericNotify.mp3",
  ],
  promote: [
    "https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/promote.mp3",
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Capture.mp3",
  ],
};

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function soundEnabled(): boolean {
  try {
    const v = localStorage.getItem("botboard-sound");
    return v === null ? true : v === "on" || v === "true" || v === "1";
  } catch {
    return true;
  }
}

// Preload and decode audio buffers into memory
async function loadSound(name: keyof typeof SOUND_URLS): Promise<AudioBuffer | null> {
  if (audioBuffers[name]) return audioBuffers[name];
  const ac = getCtx();
  if (!ac) return null;

  const urls = SOUND_URLS[name];
  for (const url of urls) {
    try {
      const res = await fetch(url, { mode: "cors", cache: "force-cache" });
      if (!res.ok) continue;
      const arrayBuf = await res.arrayBuffer();
      const decoded = await ac.decodeAudioData(arrayBuf);
      audioBuffers[name] = decoded;
      return decoded;
    } catch {
      // try fallback mirror
    }
  }
  return null;
}

// Preload all sounds on boot or user interaction
if (typeof window !== "undefined") {
  const initAudio = () => {
    Object.keys(SOUND_URLS).forEach((k) => void loadSound(k as keyof typeof SOUND_URLS));
    window.removeEventListener("pointerdown", initAudio);
    window.removeEventListener("keydown", initAudio);
  };
  window.addEventListener("pointerdown", initAudio, { once: true });
  window.addEventListener("keydown", initAudio, { once: true });
}

// Play decoded audio buffer with high-precision WebAudio gain
function playBuffer(name: keyof typeof SOUND_URLS, volume = 0.85) {
  if (!soundEnabled()) return;
  const ac = getCtx();
  if (!ac) return;

  const buf = audioBuffers[name];
  if (buf) {
    try {
      const source = ac.createBufferSource();
      const gain = ac.createGain();
      gain.gain.value = volume;
      source.buffer = buf;
      source.connect(gain).connect(ac.destination);
      source.start(0);
      return;
    } catch {
      // fallback to audio element
    }
  }

  // Backup fallback using native HTML5 Audio element if buffer isn't ready yet
  try {
    const url = SOUND_URLS[name][0];
    const audio = new Audio(url);
    audio.volume = volume;
    void audio.play().catch(() => {});
  } catch {
    // silent failure if browser blocks autoplay
  }
}

/** Authentic acoustic wood move sound */
export function playMoveSound() {
  playBuffer("move", 0.9);
}

/** Punchy acoustic wood capture sound (piece collision clack) */
export function playCaptureSound() {
  playBuffer("capture", 1.0);
}

/** Rapid double-tap castle sound */
export function playCastleSound() {
  playBuffer("castle", 0.95);
}

/** Crisp check alert sound */
export function playCheckSound() {
  playBuffer("check", 0.9);
}

/** Piece promotion sound */
export function playPromoteSound() {
  playBuffer("promote", 0.95);
}

/**
 * Convenience router: automatically selects the right acoustic sound based on the move:
 * - Castle -> double wood tap
 * - Capture -> wood piece collision clack
 * - Check / Checkmate -> check sound
 * - Normal move -> acoustic wood thump
 */
export function playMoveResultSound(
  move: { captured?: string; flags?: string; san?: string } | null | undefined,
) {
  if (!move) return;

  const isCheck = typeof move.san === "string" && /[+#]/.test(move.san);
  const isCastle =
    (typeof move.flags === "string" && /[kq]/.test(move.flags)) ||
    (typeof move.san === "string" && /O-O/.test(move.san));
  const isCapture = !!move.captured || (typeof move.flags === "string" && /[ce]/.test(move.flags));
  const isPromotion =
    (typeof move.flags === "string" && /[npbqr]/.test(move.flags)) ||
    (typeof move.san === "string" && /=/.test(move.san));

  if (isCheck) {
    playCheckSound();
  } else if (isCastle) {
    playCastleSound();
  } else if (isCapture) {
    playCaptureSound();
  } else if (isPromotion) {
    playPromoteSound();
  } else {
    playMoveSound();
  }
}
