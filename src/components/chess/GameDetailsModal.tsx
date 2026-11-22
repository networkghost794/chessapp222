import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Camera, Plus, Minus, Search, User } from "lucide-react";

export interface PlayerDetails {
  name: string;
  rating: string;
  title: string;
  country: string;
  avatarUrl: string;
}

export interface GameDetailsData {
  white: PlayerDetails;
  black: PlayerDetails;
  result: string;
  event: string;
  timeControl: string;
  termination: string;
  location: string;
  round: string;
  eco: string;
  date: string;
}

export const DEFAULT_GAME_DETAILS: GameDetailsData = {
  white: { name: "", rating: "", title: "", country: "", avatarUrl: "" },
  black: { name: "", rating: "", title: "", country: "", avatarUrl: "" },
  result: "*",
  event: "",
  timeControl: "",
  termination: "",
  location: "",
  round: "",
  eco: "",
  date: "",
};

const CHESS_TITLES = ["-- Title --", "GM", "WGM", "IM", "WIM", "FM", "WFM", "CM", "WCM", "NM"];

export const ANALYSIS_COUNTRIES = [
  { code: "", flag: "", label: "-- Country --" },
  { code: "US", flag: "🇺🇸", label: "🇺🇸 United States" },
  { code: "CA", flag: "🇨🇦", label: "🇨🇦 Canada" },
  { code: "NO", flag: "🇳🇴", label: "🇳🇴 Norway" },
  { code: "IN", flag: "🇮🇳", label: "🇮🇳 India" },
  { code: "RU", flag: "🇷🇺", label: "🇷🇺 FIDE / Russia" },
  { code: "FR", flag: "🇫🇷", label: "🇫🇷 France" },
  { code: "DE", flag: "🇩🇪", label: "🇩🇪 Germany" },
  { code: "ES", flag: "🇪🇸", label: "🇪🇸 Spain" },
  { code: "GB", flag: "🇬🇧", label: "🇬🇧 United Kingdom" },
  { code: "CN", flag: "🇨🇳", label: "🇨🇳 China" },
  { code: "BR", flag: "🇧🇷", label: "🇧🇷 Brazil" },
  { code: "PL", flag: "🇵🇱", label: "🇵🇱 Poland" },
  { code: "UA", flag: "🇺🇦", label: "🇺🇦 Ukraine" },
  { code: "AM", flag: "🇦🇲", label: "🇦🇲 Armenia" },
  { code: "NL", flag: "🇳🇱", label: "🇳🇱 Netherlands" },
  { code: "UZ", flag: "🇺🇿", label: "🇺🇿 Uzbekistan" },
  { code: "AZ", flag: "🇦🇿", label: "🇦🇿 Azerbaijan" },
];

export function countryCodeToFlag(code: string): string {
  if (!code) return "";
  const match = ANALYSIS_COUNTRIES.find((c) => c.code === code);
  if (match) return match.flag;
  if (code.length === 2) {
    return code
      .toUpperCase()
      .replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
  }
  return code;
}

function PlayerFieldsSection({
  sideLabel,
  placeholder,
  player,
  expanded,
  onToggleExpand,
  onChange,
}: {
  sideLabel: string;
  placeholder: string;
  player: PlayerDetails;
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (next: PlayerDetails) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="block font-semibold text-neutral-200 text-xs">{sideLabel}</span>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400 pointer-events-none" />
          <Input
            placeholder={placeholder}
            value={player.name}
            onChange={(e) => onChange({ ...player, name: e.target.value })}
            className="pl-9 bg-[#3a3835] border-neutral-600/80 text-white placeholder:text-neutral-400 h-9"
          />
        </div>
        <Input
          placeholder="Rating"
          value={player.rating}
          onChange={(e) => onChange({ ...player, rating: e.target.value })}
          className="w-20 bg-[#3a3835] border-neutral-600/80 text-white placeholder:text-neutral-400 h-9 tabular-nums"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleExpand}
          aria-label={`Toggle ${sideLabel} extra details`}
          className="h-9 w-9 text-neutral-300 hover:text-white hover:bg-neutral-700/60 shrink-0"
        >
          {expanded ? <Minus className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        </Button>
      </div>

      {expanded && (
        <div className="pt-1 flex gap-3 items-start">
          <div className="w-[92px] h-[108px] bg-[#d4d4d4] rounded overflow-hidden relative flex flex-col items-center justify-center shrink-0">
            {player.avatarUrl ? (
              <img
                src={player.avatarUrl}
                alt={`${sideLabel} avatar`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex-1 w-full flex items-center justify-center bg-[#cfcfcf] text-[#f4f4f4]">
                <User className="h-12 w-12 fill-[#efefef] text-[#efefef]" />
              </div>
            )}
            <label className="w-full bg-white/95 hover:bg-white text-[11px] font-semibold py-1.5 flex items-center justify-center gap-1 cursor-pointer text-neutral-700 border-t border-neutral-300/60">
              <Camera className="h-3.5 w-3.5 text-[#3b82f6] fill-[#3b82f6]/20" />
              <span>Add</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = () => onChange({ ...player, avatarUrl: String(reader.result) });
                    reader.readAsDataURL(file);
                  }
                }}
              />
            </label>
          </div>

          <div className="flex-1 space-y-2 min-w-0">
            <select
              value={player.title}
              onChange={(e) => onChange({ ...player, title: e.target.value })}
              aria-label={`${sideLabel} chess title`}
              className="w-full h-8 bg-[#3a3835] border border-neutral-600/80 rounded px-2.5 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            >
              {CHESS_TITLES.map((t) => (
                <option key={t} value={t === "-- Title --" ? "" : t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              value={player.country}
              onChange={(e) => onChange({ ...player, country: e.target.value })}
              aria-label={`${sideLabel} country`}
              className="w-full h-8 bg-[#3a3835] border border-neutral-600/80 rounded px-2.5 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            >
              {ANALYSIS_COUNTRIES.map((c) => (
                <option key={c.code || "none"} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>

            <Input
              placeholder="Avatar URL"
              value={player.avatarUrl}
              onChange={(e) => onChange({ ...player, avatarUrl: e.target.value })}
              className="h-8 text-xs bg-[#3a3835] border-neutral-600/80 text-white placeholder:text-neutral-400"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function GameDetailsModal({
  open,
  onOpenChange,
  initialData,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData: GameDetailsData;
  onSave: (data: GameDetailsData) => void;
}) {
  const [data, setData] = useState<GameDetailsData>(initialData);
  const [whiteExpanded, setWhiteExpanded] = useState(false);
  const [blackExpanded, setBlackExpanded] = useState(false);

  useEffect(() => {
    if (open) {
      setData(initialData);
    }
  }, [open, initialData]);

  const handleSave = () => {
    onSave(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] bg-[#272522] text-neutral-100 border-neutral-700/80 p-6 rounded-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight text-white">
            Game Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm mt-1">
          <PlayerFieldsSection
            sideLabel="White"
            placeholder="White Player"
            player={data.white}
            expanded={whiteExpanded}
            onToggleExpand={() => setWhiteExpanded((v) => !v)}
            onChange={(white) => setData({ ...data, white })}
          />

          <PlayerFieldsSection
            sideLabel="Black"
            placeholder="Black Player"
            player={data.black}
            expanded={blackExpanded}
            onToggleExpand={() => setBlackExpanded((v) => !v)}
            onChange={(black) => setData({ ...data, black })}
          />

          <div>
            <select
              value={data.result}
              onChange={(e) => setData({ ...data, result: e.target.value })}
              aria-label="Game result"
              className="w-full h-9 bg-[#3a3835] border border-neutral-600/80 rounded-md px-3 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            >
              <option value="*">No Result (*)</option>
              <option value="1-0">1-0 (White Wins)</option>
              <option value="0-1">0-1 (Black Wins)</option>
              <option value="1/2-1/2">1/2-1/2 (Draw)</option>
            </select>
          </div>

          <div className="space-y-2.5">
            <Input
              placeholder="Event"
              value={data.event}
              onChange={(e) => setData({ ...data, event: e.target.value })}
              className="bg-[#3a3835] border-neutral-600/80 text-white placeholder:text-neutral-400 h-9"
            />
            <Input
              placeholder="Time Control"
              value={data.timeControl}
              onChange={(e) => setData({ ...data, timeControl: e.target.value })}
              className="bg-[#3a3835] border-neutral-600/80 text-white placeholder:text-neutral-400 h-9"
            />
            <Input
              placeholder="Termination"
              value={data.termination}
              onChange={(e) => setData({ ...data, termination: e.target.value })}
              className="bg-[#3a3835] border-neutral-600/80 text-white placeholder:text-neutral-400 h-9"
            />
            <Input
              placeholder="Location"
              value={data.location}
              onChange={(e) => setData({ ...data, location: e.target.value })}
              className="bg-[#3a3835] border-neutral-600/80 text-white placeholder:text-neutral-400 h-9"
            />
          </div>

          <div className="grid grid-cols-[1fr_1fr_1.6fr] gap-2">
            <Input
              placeholder="Round"
              value={data.round}
              onChange={(e) => setData({ ...data, round: e.target.value })}
              className="bg-[#3a3835] border-neutral-600/80 text-white placeholder:text-neutral-400 h-9"
            />
            <Input
              placeholder="ECO"
              value={data.eco}
              onChange={(e) => setData({ ...data, eco: e.target.value })}
              className="bg-[#3a3835] border-neutral-600/80 text-white placeholder:text-neutral-400 h-9"
            />
            <Input
              type="date"
              value={data.date}
              onChange={(e) => setData({ ...data, date: e.target.value })}
              aria-label="Game date"
              className="bg-[#3a3835] border-neutral-600/80 text-neutral-200 text-xs h-9"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            className="bg-[#3a3835] hover:bg-[#484541] text-neutral-200 font-semibold h-10"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="bg-[#81b64c] hover:bg-[#6c9a3f] text-white font-bold h-10"
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
