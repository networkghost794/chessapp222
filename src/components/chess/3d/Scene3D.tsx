import { lazy, Suspense, useEffect, useState } from "react";
import type { Chess, Color, Square } from "chess.js";
import {
  ArrowLeftRight,
  Clock,
  Hand,
  Layers,
  Maximize2,
  Minimize2,
  RotateCcw,
  Timer,
} from "lucide-react";
import { useSettings } from "@/lib/settings";
import { Board2D, type MoveIndicator } from "../Board";
import { CAMERA_PRESETS_3D } from "./assets3d";
import { cn } from "@/lib/utils";

const LazyViewport3D = lazy(() => import("./ChessViewport3D"));

export interface Scene3DProps {
  game: Chess;
  flipped: boolean;
  disabled: boolean;
  lastMove: { from: Square; to: Square } | null;
  onAttemptMove: (from: Square, to: Square) => boolean;
  activeSide?: Color;
  whiteTimeMs?: number | null;
  blackTimeMs?: number | null;
  activeClockSide?: Color;
  playerSide?: Color;
  needsClockPunch?: boolean;
  onClockPunch?: () => void;
  indicators?: Record<string, MoveIndicator> | null;
  bestFrom?: string | null;
  isTheater?: boolean;
  onToggleTheater?: () => void;
}

export function Scene3D(props: Scene3DProps) {
  const [settings, updateSetting] = useSettings();
  const [mounted, setMounted] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [cameraResetSeq, setCameraResetSeq] = useState(0);

  useEffect(() => {
    setMounted(true);
    try {
      const testCanvas = document.createElement("canvas");
      const gl = testCanvas.getContext("webgl2") || testCanvas.getContext("webgl");
      if (!gl) setWebglFailed(true);
    } catch {
      setWebglFailed(true);
    }
  }, []);

  // SSR / WebGL-unavailable safe fallback to standard 2D Board
  if (!mounted || webglFailed) {
    return (
      <Board2D
        game={props.game}
        flipped={props.flipped}
        disabled={props.disabled}
        lastMove={props.lastMove}
        onAttemptMove={props.onAttemptMove}
        indicators={props.indicators}
        bestFrom={props.bestFrom}
        force2D
      />
    );
  }

  const activeSide: Color = props.activeSide ?? props.game.turn();
  const fen = props.game.fen();

  const handleReturnTo2D = () => {
    updateSetting("immersive3D", false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("toggle-3d-view", { detail: { immersive3D: false } }));
    }
  };

  return (
    <div
      className={cn(
        "relative w-full mx-auto rounded-xl overflow-hidden border border-border/70 bg-neutral-950 shadow-lg transition-[max-width,height] duration-200",
        props.isTheater
          ? "aspect-[16/9] min-h-[460px] sm:min-h-[560px] lg:min-h-[70vh] max-h-[85vh]"
          : "aspect-[16/10] min-h-[360px] sm:min-h-[450px] lg:min-h-[520px] max-h-[84vh]",
      )}
      style={
        props.isTheater
          ? undefined
          : { maxWidth: "calc(min(88vh, 1100px) * var(--board-scale, 1))" }
      }
    >
      <Suspense
        fallback={
          <div className="w-full h-full grid place-items-center bg-neutral-900 text-xs text-muted-foreground">
            Initializing 3D tabletop…
          </div>
        }
      >
        <LazyViewport3D
          game={props.game}
          fen={fen}
          flipped={props.flipped}
          disabled={props.disabled}
          lastMove={props.lastMove}
          onAttemptMove={props.onAttemptMove}
          activeSide={activeSide}
          whiteTimeMs={props.whiteTimeMs}
          blackTimeMs={props.blackTimeMs}
          activeClockSide={props.activeClockSide}
          playerSide={props.playerSide}
          needsClockPunch={props.needsClockPunch}
          onClockPunch={props.onClockPunch}
          settings={settings}
          cameraResetSeq={cameraResetSeq}
          onContextError={() => setWebglFailed(true)}
        />
      </Suspense>

      {/* Top-left prompt when waiting for human to punch the clock */}
      {props.needsClockPunch && props.onClockPunch && (
        <div className="absolute top-3 left-3 z-10">
          <button
            type="button"
            onClick={props.onClockPunch}
            className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 px-3.5 py-1.5 rounded-md text-xs font-extrabold border border-amber-300 shadow-lg transition-colors cursor-pointer"
          >
            <Hand className="w-3.5 h-3.5" />
            <span>Hit Clock (Space)</span>
          </button>
        </div>
      )}

      {/* Top-right controls: Clock Style switcher + Manual Clock toggle + 2D quick-switch button */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() =>
            updateSetting(
              "clockStyle3D",
              settings.clockStyle3D === "digital_tournament"
                ? "analog_vintage"
                : "digital_tournament",
            )
          }
          className="inline-flex items-center gap-1.5 bg-card/95 hover:bg-card text-foreground px-2.5 py-1.5 rounded-md text-xs font-medium border border-border shadow-md transition-colors cursor-pointer"
          title="Switch between Digital Tournament and Vintage Analog 3D clock"
        >
          <Clock className="w-3.5 h-3.5 text-primary" />
          <span className="hidden sm:inline">
            {settings.clockStyle3D === "digital_tournament" ? "Digital" : "Analog"}
          </span>
        </button>
        <button
          type="button"
          onClick={() =>
            updateSetting("clockSide3D", settings.clockSide3D === "right" ? "left" : "right")
          }
          className="inline-flex items-center gap-1.5 bg-card/95 hover:bg-card text-foreground px-2.5 py-1.5 rounded-md text-xs font-medium border border-border shadow-md transition-colors cursor-pointer"
          title="Place physical chess clock on the Left or Right side of the board"
        >
          <ArrowLeftRight className="w-3.5 h-3.5 text-primary" />
          <span className="hidden sm:inline">
            {settings.clockSide3D === "right" ? "Right" : "Left"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => updateSetting("manualClockPunch", !settings.manualClockPunch)}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border shadow-md transition-colors cursor-pointer",
            settings.manualClockPunch
              ? "bg-amber-500/95 text-zinc-950 border-amber-300 font-semibold"
              : "bg-card/95 hover:bg-card text-muted-foreground hover:text-foreground border-border",
          )}
          title="Press the clock yourself after each move (click 3D clock or press Spacebar)"
        >
          <Timer className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Manual Clock</span>
        </button>
        {props.onToggleTheater && (
          <button
            type="button"
            onClick={props.onToggleTheater}
            className="inline-flex items-center justify-center bg-card/95 hover:bg-card text-foreground px-2 py-1.5 rounded-md text-xs font-medium border border-border shadow-md transition-colors cursor-pointer"
            title={props.isTheater ? "Exit Theater mode" : "Expand board (Theater mode)"}
            aria-label={props.isTheater ? "Exit Theater mode" : "Expand board"}
          >
            {props.isTheater ? (
              <Minimize2 className="w-3.5 h-3.5 text-primary" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-primary" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={handleReturnTo2D}
          className="inline-flex items-center gap-1.5 bg-card/95 hover:bg-card text-foreground px-3 py-1.5 rounded-md text-xs font-medium border border-border shadow-md transition-colors cursor-pointer"
          title="Switch back to 2D board"
        >
          <Layers className="w-3.5 h-3.5 text-primary" />
          <span>2D View</span>
        </button>
      </div>

      {/* Bottom-left quick camera angle switcher */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1 bg-card/95 border border-border rounded-md p-1 shadow-md">
        {CAMERA_PRESETS_3D.map((cam) => {
          const active = settings.cameraPreset3D === cam.id;
          return (
            <button
              key={cam.id}
              type="button"
              onClick={() => {
                updateSetting("cameraPreset3D", cam.id);
                setCameraResetSeq((n) => n + 1);
              }}
              className={cn(
                "px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary",
              )}
              title={cam.name}
            >
              {cam.shortLabel}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCameraResetSeq((n) => n + 1)}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
          title="Reset camera angle"
          aria-label="Reset camera angle"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>

      {/* Bottom-right subtle interaction hint */}
      <div className="hidden sm:block absolute bottom-3 right-3 z-10 pointer-events-none bg-card/90 border border-border/70 px-2.5 py-1 rounded-md text-[10px] text-muted-foreground shadow">
        {settings.manualClockPunch
          ? "Drag or click piece to move · Click clock or Space to punch"
          : "Drag or click piece to move · Drag table to orbit · Scroll to zoom"}
      </div>
    </div>
  );
}
