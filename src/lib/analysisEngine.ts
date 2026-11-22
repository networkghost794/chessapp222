import { MODERN_ENGINE_URL } from "./stockfishEngine";

export type EngineSource = "browser" | "local_ws";

export interface EngineSettings {
  source: EngineSource;
  wsUrl: string;
  threads: number;
  hashMb: number;
  multiPv: number;
  infinite: boolean;
}

export const DEFAULT_BRIDGE_WS_URL = "ws://127.0.0.1:8765";

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  source: "browser",
  wsUrl: DEFAULT_BRIDGE_WS_URL,
  threads: 13,
  hashMb: 4096,
  multiPv: 3,
  infinite: true,
};

const SETTINGS_KEY = "hybrid_analysis_engine_settings_v3";

export function loadEngineSettings(): EngineSettings {
  if (typeof window === "undefined") return DEFAULT_ENGINE_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EngineSettings>;
      // Always start visitors in zero-setup Browser WASM mode on page load
      return {
        ...DEFAULT_ENGINE_SETTINGS,
        ...parsed,
        source: "browser",
      };
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_ENGINE_SETTINGS;
}

export function saveEngineSettings(s: EngineSettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore storage errors
  }
}

export interface PvLine {
  multipv: number;
  depth: number;
  scoreCp: number | null;
  scoreMate: number | null;
  nodes: number;
  nps: number;
  pv: string[];
}

export interface EngineAnalysisState {
  isAnalyzing: boolean;
  engineName: string;
  source: EngineSource;
  wsConnected: boolean;
  depth: number;
  nps: number;
  nodes: number;
  lines: PvLine[];
  error?: string;
}

export type AnalysisCallback = (state: EngineAnalysisState) => void;

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

class HybridAnalysisEngine {
  private worker: Worker | null = null;
  private ws: WebSocket | null = null;
  private settings: EngineSettings = DEFAULT_ENGINE_SETTINGS;
  private callbacks = new Set<AnalysisCallback>();
  private currentFen = START_FEN;
  private initialized = false;
  private engineReady = false;
  private pendingSearch = false;

  private state: EngineAnalysisState = {
    isAnalyzing: true,
    engineName: "Stockfish 18 NNUE",
    source: "browser",
    wsConnected: false,
    depth: 0,
    nps: 0,
    nodes: 0,
    lines: [],
  };

  private ensureInit() {
    if (this.initialized || typeof window === "undefined") return;
    this.initialized = true;
    this.settings = loadEngineSettings();
    this.init();
  }

  public getSettings(): EngineSettings {
    if (typeof window !== "undefined" && !this.initialized) {
      this.settings = loadEngineSettings();
    }
    return { ...this.settings };
  }

  public updateSettings(newSettings: Partial<EngineSettings>) {
    this.ensureInit();
    const prevSource = this.settings.source;
    const prevWsUrl = this.settings.wsUrl;
    const wasAnalyzing = this.state.isAnalyzing;

    this.settings = { ...this.settings, ...newSettings };
    saveEngineSettings(this.settings);

    if (newSettings.source && newSettings.source !== prevSource) {
      this.init();
      if (wasAnalyzing) {
        this.pendingSearch = true;
        this.state.isAnalyzing = true;
        this.notify();
      }
      return;
    }

    if (
      this.settings.source === "local_ws" &&
      newSettings.wsUrl &&
      newSettings.wsUrl !== prevWsUrl
    ) {
      this.cleanup();
      this.initLocalWs();
      if (wasAnalyzing) {
        this.pendingSearch = true;
        this.state.isAnalyzing = true;
        this.notify();
      }
      return;
    }

    this.applyEngineOptions();
    if (wasAnalyzing) {
      this.restartAnalysis();
    }
  }

  public connectDesktopBridge(url = this.settings.wsUrl || DEFAULT_BRIDGE_WS_URL) {
    this.ensureInit();
    this.settings = {
      ...this.settings,
      source: "local_ws",
      wsUrl: url,
      threads: this.settings.threads || 13,
      hashMb: this.settings.hashMb < 512 ? 4096 : this.settings.hashMb,
    };
    saveEngineSettings(this.settings);
    this.init();
    this.pendingSearch = true;
    this.state.isAnalyzing = true;
    this.notify();
  }

  public useBrowserWasm() {
    this.ensureInit();
    this.settings = { ...this.settings, source: "browser" };
    saveEngineSettings(this.settings);
    this.init();
    this.pendingSearch = true;
    this.state.isAnalyzing = true;
    this.notify();
  }

  public subscribe(cb: AnalysisCallback) {
    this.ensureInit();
    this.callbacks.add(cb);
    cb({ ...this.state, lines: [...this.state.lines] });
    return () => {
      this.callbacks.delete(cb);
    };
  }

  private notify() {
    const snapshot: EngineAnalysisState = {
      ...this.state,
      lines: [...this.state.lines],
    };
    this.callbacks.forEach((fn) => fn(snapshot));
  }

  public init() {
    if (typeof window === "undefined") return;
    this.stop();
    this.cleanup();
    this.engineReady = false;
    this.state.error = undefined;
    this.state.source = this.settings.source;

    if (this.settings.source === "local_ws") {
      this.initLocalWs();
    } else {
      this.initBrowserWorker();
    }
  }

  private cleanup() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.state.wsConnected = false;
  }

  private initBrowserWorker() {
    this.state.engineName = "Stockfish 18 NNUE";
    this.state.wsConnected = false;
    this.notify();

    try {
      this.worker = new Worker(MODERN_ENGINE_URL);
      this.worker.onmessage = (e) => this.handleUciOutput(String(e.data));
      this.worker.onerror = () => {
        console.warn("[AnalysisEngine] WASM worker failed, falling back to legacy v10 worker");
        const stub = `importScripts("https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js");`;
        const fb = new Worker(URL.createObjectURL(new Blob([stub], { type: "text/javascript" })));
        fb.onmessage = (e) => this.handleUciOutput(String(e.data));
        this.worker = fb;
        this.state.engineName = "Stockfish 10 (Fallback)";
        this.notify();
        this.send("uci");
      };
      this.send("uci");
    } catch {
      this.state.engineName = "Engine Offline";
      this.state.error = "Unable to start browser Stockfish worker.";
      this.notify();
    }
  }

  private initLocalWs() {
    this.state.engineName = "My PC Stockfish (Connecting...)";
    this.state.wsConnected = false;
    this.state.error = undefined;
    this.notify();

    try {
      const socket = new WebSocket(this.settings.wsUrl || DEFAULT_BRIDGE_WS_URL);
      socket.onopen = () => {
        this.state.wsConnected = true;
        this.state.error = undefined;
        const hashLabel =
          this.settings.hashMb >= 1024
            ? `${(this.settings.hashMb / 1024).toFixed(0)}GB Hash`
            : `${this.settings.hashMb}MB Hash`;
        this.state.engineName = `PC Stockfish (${this.settings.threads} Threads · ${hashLabel})`;
        this.notify();
        this.send("uci");
      };
      socket.onmessage = (e) => {
        const raw = String(e.data);
        const lines = raw.split(/\r?\n/);
        for (const l of lines) {
          if (l.trim()) this.handleUciOutput(l.trim());
        }
      };
      socket.onclose = () => {
        if (this.settings.source === "local_ws") {
          this.state.wsConnected = false;
          this.engineReady = false;
          this.state.engineName = "My PC Stockfish (Not Connected)";
          this.notify();
        }
      };
      socket.onerror = () => {
        if (this.settings.source === "local_ws") {
          this.state.wsConnected = false;
          this.engineReady = false;
          this.state.engineName = "My PC Stockfish (Not Connected)";
          this.state.error =
            "Could not connect to ws://127.0.0.1:8765. Launch BotBoard-Bridge.bat on your PC and click Reconnect.";
          this.notify();
        }
      };
      this.ws = socket;
    } catch {
      this.state.wsConnected = false;
      this.state.engineName = "My PC Stockfish (Not Connected)";
      this.state.error = "Connection failed.";
      this.notify();
    }
  }

  private send(cmd: string) {
    if (this.settings.source === "local_ws") {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(cmd + "\n");
      }
    } else if (this.worker) {
      this.worker.postMessage(cmd);
    }
  }

  private applyEngineOptions() {
    this.send(`setoption name MultiPV value ${this.settings.multiPv}`);
    if (this.settings.source === "local_ws") {
      this.send(`setoption name Threads value ${this.settings.threads}`);
      this.send(`setoption name Hash value ${this.settings.hashMb}`);
    } else {
      this.send(`setoption name Hash value ${Math.min(256, this.settings.hashMb)}`);
    }
    this.send("isready");
  }

  public evaluatePosition(fen: string) {
    this.ensureInit();
    this.currentFen = fen;
    this.state.lines = [];
    this.state.depth = 0;
    this.state.nodes = 0;
    this.state.nps = 0;
    this.state.isAnalyzing = true;
    this.notify();

    if (!this.engineReady) {
      this.pendingSearch = true;
      return;
    }

    this.dispatchSearch();
  }

  private dispatchSearch() {
    this.pendingSearch = false;
    this.send("stop");
    this.applyEngineOptions();
    this.send(`position fen ${this.currentFen}`);
    if (this.settings.infinite) {
      this.send("go infinite");
    } else {
      this.send("go depth 25");
    }
  }

  public restartAnalysis() {
    this.evaluatePosition(this.currentFen);
  }

  public stop() {
    this.pendingSearch = false;
    this.send("stop");
    this.state.isAnalyzing = false;
    this.notify();
  }

  public toggleAnalysis() {
    if (this.state.isAnalyzing) {
      this.stop();
    } else {
      this.evaluatePosition(this.currentFen);
    }
  }

  private handleUciOutput(line: string) {
    if (line.startsWith("id name ")) {
      const name = line.replace("id name ", "").trim();
      if (name) {
        if (this.settings.source === "browser") {
          this.state.engineName = name;
        } else {
          const hashLabel =
            this.settings.hashMb >= 1024
              ? `${(this.settings.hashMb / 1024).toFixed(0)}GB Hash`
              : `${this.settings.hashMb}MB Hash`;
          this.state.engineName = `${name} (${this.settings.threads}T · ${hashLabel})`;
        }
        this.notify();
      }
      return;
    }

    if (line === "uciok") {
      this.engineReady = true;
      this.applyEngineOptions();
      if (this.pendingSearch || this.state.isAnalyzing) {
        this.dispatchSearch();
      }
      return;
    }

    if (
      line.startsWith("info ") &&
      line.includes(" depth ") &&
      line.includes(" score ") &&
      !line.includes(" lowerbound") &&
      !line.includes(" upperbound")
    ) {
      this.parseInfoLine(line);
    }
  }

  private parseInfoLine(line: string) {
    if (!this.state.isAnalyzing) return;
    const tokens = line.split(/\s+/);
    let multipv = 1;
    let depth = this.state.depth;
    let nodes = this.state.nodes;
    let nps = this.state.nps;
    let scoreCp: number | null = null;
    let scoreMate: number | null = null;
    let pvIdx = -1;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === "multipv" && tokens[i + 1]) multipv = parseInt(tokens[i + 1], 10);
      else if (t === "depth" && tokens[i + 1]) depth = parseInt(tokens[i + 1], 10);
      else if (t === "nodes" && tokens[i + 1]) nodes = parseInt(tokens[i + 1], 10);
      else if (t === "nps" && tokens[i + 1]) nps = parseInt(tokens[i + 1], 10);
      else if (t === "score") {
        const type = tokens[i + 1];
        const val = parseInt(tokens[i + 2], 10);
        if (type === "cp" && !Number.isNaN(val)) scoreCp = val;
        else if (type === "mate" && !Number.isNaN(val)) scoreMate = val;
      } else if (t === "pv") {
        pvIdx = i + 1;
        break;
      }
    }

    if (pvIdx !== -1) {
      const pv = tokens.slice(pvIdx);
      if (pv.length === 0) return;

      this.state.depth = Math.max(this.state.depth, depth);
      this.state.nodes = nodes;
      this.state.nps = nps;

      const existingIndex = this.state.lines.findIndex((l) => l.multipv === multipv);
      const newLine: PvLine = {
        multipv,
        depth,
        scoreCp,
        scoreMate,
        nodes,
        nps,
        pv,
      };

      if (existingIndex >= 0) {
        this.state.lines[existingIndex] = newLine;
      } else {
        this.state.lines.push(newLine);
      }

      this.state.lines = this.state.lines
        .filter((l) => l.multipv <= this.settings.multiPv)
        .sort((a, b) => a.multipv - b.multipv);

      this.notify();
    }
  }
}

export const analysisEngine = new HybridAnalysisEngine();
