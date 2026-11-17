import { useCallback, useEffect, useRef, useState } from "react";
import type { Color } from "chess.js";
import type { TimeControlConfig } from "./timeControls";

export interface ChessClockState {
  whiteMs: number | null;
  blackMs: number | null;
  activeSide: Color;
  timedOutSide: Color | null;
  isUnlimited: boolean;
  startTurn: (side: Color) => void;
  commitMoveOnClock: (movedSide: Color) => void;
  resetClock: (tc?: TimeControlConfig) => void;
  pauseClock: () => void;
}

export function useChessClock(
  timeControl: TimeControlConfig,
  options: {
    enabled: boolean; // false before game starts or after game over
    running: boolean; // true once match has moves underway
  },
): ChessClockState {
  const isUnlimited = timeControl.baseMinutes <= 0;
  const initialMs = isUnlimited ? null : timeControl.baseMinutes * 60 * 1000;

  const [whiteMs, setWhiteMs] = useState<number | null>(initialMs);
  const [blackMs, setBlackMs] = useState<number | null>(initialMs);
  const [activeSide, setActiveSide] = useState<Color>("w");
  const [timedOutSide, setTimedOutSide] = useState<Color | null>(null);
  const [paused, setPaused] = useState(false);

  const whiteRef = useRef<number | null>(initialMs);
  const blackRef = useRef<number | null>(initialMs);
  const activeRef = useRef<Color>("w");
  const timedOutRef = useRef<Color | null>(null);
  const incMsRef = useRef<number>(timeControl.incrementSeconds * 1000);
  incMsRef.current = timeControl.incrementSeconds * 1000;

  // Keep synced when timeControl changes while match hasn't started
  useEffect(() => {
    if (!options.running) {
      const next = timeControl.baseMinutes <= 0 ? null : timeControl.baseMinutes * 60 * 1000;
      whiteRef.current = next;
      blackRef.current = next;
      timedOutRef.current = null;
      activeRef.current = "w";
      setWhiteMs(next);
      setBlackMs(next);
      setTimedOutSide(null);
      setActiveSide("w");
      setPaused(false);
    }
  }, [timeControl.baseMinutes, timeControl.incrementSeconds, options.running]);

  useEffect(() => {
    if (isUnlimited || !options.enabled || !options.running || paused || timedOutRef.current) {
      return;
    }

    let lastTick = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.max(0, now - lastTick);
      lastTick = now;

      if (timedOutRef.current) return;

      if (activeRef.current === "w") {
        const cur = whiteRef.current ?? 0;
        const next = Math.max(0, cur - dt);
        whiteRef.current = next;
        setWhiteMs(next);
        if (next <= 0) {
          timedOutRef.current = "w";
          setTimedOutSide("w");
        }
      } else {
        const cur = blackRef.current ?? 0;
        const next = Math.max(0, cur - dt);
        blackRef.current = next;
        setBlackMs(next);
        if (next <= 0) {
          timedOutRef.current = "b";
          setTimedOutSide("b");
        }
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, [isUnlimited, options.enabled, options.running, paused]);

  const startTurn = useCallback((side: Color) => {
    activeRef.current = side;
    setActiveSide(side);
  }, []);

  const commitMoveOnClock = useCallback((movedSide: Color) => {
    if (timedOutRef.current) return;
    const inc = incMsRef.current;
    if (inc > 0) {
      if (movedSide === "w" && whiteRef.current !== null) {
        whiteRef.current += inc;
        setWhiteMs(whiteRef.current);
      } else if (movedSide === "b" && blackRef.current !== null) {
        blackRef.current += inc;
        setBlackMs(blackRef.current);
      }
    }
    const nextSide: Color = movedSide === "w" ? "b" : "w";
    activeRef.current = nextSide;
    setActiveSide(nextSide);
  }, []);

  const resetClock = useCallback(
    (tc?: TimeControlConfig) => {
      const cfg = tc ?? timeControl;
      const next = cfg.baseMinutes <= 0 ? null : cfg.baseMinutes * 60 * 1000;
      whiteRef.current = next;
      blackRef.current = next;
      timedOutRef.current = null;
      activeRef.current = "w";
      setWhiteMs(next);
      setBlackMs(next);
      setTimedOutSide(null);
      setActiveSide("w");
      setPaused(false);
    },
    [timeControl],
  );

  const pauseClock = useCallback(() => {
    setPaused(true);
  }, []);

  return {
    whiteMs,
    blackMs,
    activeSide,
    timedOutSide,
    isUnlimited,
    startTurn,
    commitMoveOnClock,
    resetClock,
    pauseClock,
  };
}
