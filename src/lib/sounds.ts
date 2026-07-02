// Lightweight synthesized chess sound effects using WebAudio.
// No external asset dependencies. Respects the "chess:sound" localStorage
// toggle written by SettingsPage (defaults to "on").

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC: typeof AudioContext =
        (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ||
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
    const v = localStorage.getItem("chess:sound");
    return v === null ? true : v === "on" || v === "true" || v === "1";
  } catch {
    return true;
  }
}

/** Short, soft "wood tap" for a normal move. */
export function playMoveSound() {
  if (!soundEnabled()) return;
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;

  // Body: quick sine thump
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(140, now + 0.09);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.15);

  // Click: tiny filtered noise burst for the "tap"
  const bufSize = Math.floor(ac.sampleRate * 0.03);
  const buffer = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const nGain = ac.createGain();
  const filt = ac.createBiquadFilter();
  filt.type = "highpass";
  filt.frequency.value = 1800;
  nGain.gain.setValueAtTime(0.18, now);
  nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
  noise.connect(filt).connect(nGain).connect(ac.destination);
  noise.start(now);
  noise.stop(now + 0.05);
}

/** Sharper, punchier sound for a capture. */
export function playCaptureSound() {
  if (!soundEnabled()) return;
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;

  // Lower thud
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(70, now + 0.13);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.5, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.2);

  // Sharper crack: wide-band noise burst
  const bufSize = Math.floor(ac.sampleRate * 0.08);
  const buffer = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const nGain = ac.createGain();
  const filt = ac.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = 2200;
  filt.Q.value = 0.9;
  nGain.gain.setValueAtTime(0.4, now);
  nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  noise.connect(filt).connect(nGain).connect(ac.destination);
  noise.start(now);
  noise.stop(now + 0.1);
}

/** Convenience: pick sound from a chess.js move result. */
export function playMoveResultSound(move: { captured?: string; flags?: string } | null | undefined) {
  if (!move) return;
  const isCapture = !!move.captured || (typeof move.flags === "string" && /[ce]/.test(move.flags));
  if (isCapture) playCaptureSound();
  else playMoveSound();
}
