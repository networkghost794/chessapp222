import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Award, Bot, RotateCcw, Trophy, UserPlus } from "lucide-react";
import type { PrivateBotProfile } from "@/lib/privateBotPlayerStore";
import { TitleBadge } from "./ChessApp";

export function PrivateRatingModal({
  open,
  onClose,
  result,
  reason,
  userProfile,
  oldRating,
  newRating,
  delta,
  opponentName,
  opponentAvatar,
  opponentOldRating,
  opponentDelta,
  onRematch,
  onNewMatch,
}: {
  open: boolean;
  onClose: () => void;
  result: "win" | "loss" | "draw";
  reason?: string;
  userProfile: PrivateBotProfile;
  oldRating: number;
  newRating: number;
  delta: number;
  opponentName: string;
  opponentAvatar?: string | null;
  opponentOldRating: number;
  opponentDelta: number;
  onRematch: () => void;
  onNewMatch: () => void;
}) {
  const [displayRating, setDisplayRating] = useState(oldRating);
  const isWin = result === "win";
  const isLoss = result === "loss";

  useEffect(() => {
    if (!open) return;
    setDisplayRating(oldRating);

    let rafId = 0;
    const duration = 1200;

    const timer = window.setTimeout(() => {
      const startTime = performance.now();
      const frame = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(oldRating + (newRating - oldRating) * eased);
        setDisplayRating(current);

        if (progress < 1) {
          rafId = window.requestAnimationFrame(frame);
        }
      };
      rafId = window.requestAnimationFrame(frame);
    }, 320);

    return () => {
      window.clearTimeout(timer);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [open, oldRating, newRating]);

  const oppNewRating = opponentOldRating + opponentDelta;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-[#121417] border border-[#262a30] text-foreground p-0 overflow-hidden shadow-2xl rounded-2xl">
        {/* Banner */}
        <div
          className={`p-6 text-center border-b border-[#262a30] ${
            isWin ? "bg-emerald-950/35" : isLoss ? "bg-red-950/25" : "bg-neutral-900/90"
          }`}
        >
          <div className="w-16 h-16 rounded-full mx-auto mb-3 border-2 border-warning/40 overflow-hidden bg-card shadow-lg flex items-center justify-center">
            {userProfile.avatar ? (
              <img
                src={userProfile.avatar}
                alt={userProfile.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Trophy className="w-8 h-8 text-warning" />
            )}
          </div>
          <DialogTitle className="text-xl font-black tracking-tight text-white flex items-center justify-center gap-1.5">
            <TitleBadge title={userProfile.title} color={userProfile.titleColor} size="sm" />
            <span>{userProfile.name}</span>
            {userProfile.country && <span className="text-base">{userProfile.country}</span>}
          </DialogTitle>
          <DialogDescription className="text-xs font-semibold tracking-wider uppercase mt-1 text-zinc-400">
            {isWin && <span className="text-emerald-400 font-bold">VICTORY</span>}
            {isLoss && <span className="text-red-400 font-bold">DEFEAT</span>}
            {!isWin && !isLoss && <span className="text-zinc-300 font-bold">DRAW</span>}
            {reason && <span className="text-zinc-400 font-normal"> · {reason}</span>}
            <span className="text-zinc-500 font-normal"> vs {opponentName}</span>
          </DialogDescription>
        </div>

        {/* Animated Rating Centerpiece (Chess.com style 1132 +11) */}
        <div className="p-6 space-y-5">
          <div className="bg-[#181b1f] border border-[#2a2e35] rounded-xl p-5 text-center">
            <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-semibold mb-2">
              Private Glicko-2 Rating
            </div>
            <div className="flex items-center justify-center gap-3">
              <span className="text-4xl sm:text-5xl font-black text-white tracking-tight tabular-nums font-mono">
                {displayRating}
              </span>
              <span
                className={`text-xl sm:text-2xl font-extrabold font-mono px-2.5 py-0.5 rounded-md tabular-nums ${
                  delta > 0
                    ? "text-[#81b64c] bg-[#81b64c]/15"
                    : delta < 0
                      ? "text-red-400 bg-red-500/15"
                      : "text-zinc-400 bg-zinc-800"
                }`}
              >
                {delta > 0 ? `+${delta}` : delta}
              </span>
            </div>

            {newRating >= userProfile.peakRating && newRating > oldRating && (
              <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-warning bg-warning/10 px-2.5 py-1 rounded-full border border-warning/30 font-semibold">
                <Award className="w-3.5 h-3.5" /> All-Time Private Peak!
              </div>
            )}
          </div>

          {/* Opponent Rating Summary */}
          <div className="flex items-center justify-between p-3.5 bg-[#181b1f]/70 rounded-lg border border-[#22252a] text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-zinc-800 overflow-hidden shrink-0 grid place-items-center">
                {opponentAvatar ? (
                  <img
                    src={opponentAvatar}
                    alt={opponentName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Bot className="w-4 h-4 text-zinc-400" />
                )}
              </div>
              <span className="font-semibold text-zinc-200 truncate">{opponentName}</span>
            </div>
            <div className="font-mono text-zinc-300 shrink-0 tabular-nums">
              {oppNewRating}{" "}
              <span
                className={
                  opponentDelta > 0
                    ? "text-[#81b64c]"
                    : opponentDelta < 0
                      ? "text-red-400"
                      : "text-zinc-500"
                }
              >
                ({opponentDelta > 0 ? `+${opponentDelta}` : opponentDelta})
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <Button
              onClick={onRematch}
              className="bg-warning text-black hover:bg-warning/90 font-bold h-11"
            >
              <RotateCcw className="w-4 h-4 mr-1.5" /> Rematch
            </Button>
            <Button
              onClick={onNewMatch}
              variant="outline"
              className="border-[#2a2e35] bg-[#1a1d21] text-zinc-200 hover:bg-[#22252b] h-11"
            >
              <UserPlus className="w-4 h-4 mr-1.5" /> Change Bot
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
