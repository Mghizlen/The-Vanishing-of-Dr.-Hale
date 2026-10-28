"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Backpack,
  BookOpen,
  Clock3,
  Gem,
  KeyRound,
  Lightbulb,
  Map,
  Package,
  RefreshCw,
  ScrollText,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { HOTSPOTS, puzzleById, type Hotspot } from "@/lib/game/content-config";

type View = "booting" | "loggedOut" | "lobby" | "starting" | "playing" | "cooldown" | "device" | "expired" | "completed" | "fatal";
type Level = { key: string; durationMinutes: number; stages: number; puzzleCount: number; maxHints: number };
type Save = { schemaVersion: "1.0"; sessionId: string; duration: number; authoritativeExpiry: string; currentStage: number; inventory: string[]; inspectedObjects: string[]; solvedPuzzles: string[]; hintCount: number };
type Session = { sessionId: string; duration: number; startedAt: string; authoritativeExpiry: string; status: string };
type State = { view: View; username: string; levels: Level[]; session: Session | null; save: Save | null; revision: number; serverOffset: number; cooldownUntil: string | null; reason: string | null; message: string; score?: number };
type StatusData = { state: "none" | "active" | "cooldown"; session?: Session; cooldownUntil?: string; reason?: string };
type StateData = { state: Save; revision: number; session: Session };
type StartData = { sessionId: string; duration: number; startedAt: string; authoritativeExpiry: string; status: string; initialState: Save };
type HintData = { hint: string; hintCount: number; revision: number };
type Action = Partial<State> & { type: "patch" };

const levels: Level[] = [
  { key: "demo", durationMinutes: 10, stages: 1, puzzleCount: 2, maxHints: 3 },
  { key: "detective", durationMinutes: 15, stages: 2, puzzleCount: 3, maxHints: 5 },
  { key: "investigator", durationMinutes: 30, stages: 3, puzzleCount: 4, maxHints: 4 },
  { key: "master", durationMinutes: 60, stages: 4, puzzleCount: 5, maxHints: 3 },
  { key: "expert", durationMinutes: 90, stages: 5, puzzleCount: 6, maxHints: 2 },
];
const scenes = [
  { id: "study", name: "The Study" },
  { id: "library", name: "The Library" },
  { id: "observatory-dome", name: "Observatory Dome" },
  { id: "cellar", name: "The Cellar" },
  { id: "rooftop", name: "The Rooftop" },
];
const puzzles = [
  ["puz_drawer_code", "The Calendar Code", ["184", "314", "621", "907"]],
  ["puz_torn_letter", "The Torn Letter", ["Meet me beneath the stars.", "Leave before dawn.", "The key is lost.", "Trust no one."]],
  ["puz_books", "The Bookshelf", ["Blue, red, green", "Red, green, blue", "Green, blue, red", "Blue, green, red"]],
  ["puz_stars", "The Star Dial", ["Orion", "Lyra", "Cygnus", "Draco"]],
  ["puz_cipher", "The Chest Cipher", ["HIDE", "NORTH", "MOON", "HALL"]],
  ["puz_accusation", "The Final Accusation", ["The curator", "The groundskeeper", "The assistant", "No one"]],
] as const;
const itemIcons: Record<string, typeof KeyRound> = {
  item_brass_key: KeyRound,
  item_letter_full: ScrollText,
  item_observatory_pass: BookOpen,
  item_lens: Gem,
  item_cellar_map: Map,
  item_journal: BookOpen,
};
const itemNames: Record<string, string> = {
  item_brass_key: "Brass key",
  item_letter_full: "Full letter",
  item_observatory_pass: "Observatory pass",
  item_lens: "Telescope lens",
  item_cellar_map: "Cellar map",
  item_journal: "Dr. Hale's journal",
};
const initialState: State = { view: "booting", username: "", levels, session: null, save: null, revision: 0, serverOffset: 0, cooldownUntil: null, reason: null, message: "" };
function reducer(state: State, action: Action): State { return action.type === "patch" ? { ...state, ...action } : state; }

function formatRemaining(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function SceneFallback({ scene }: { scene: string }) {
  return <div className="scene-fallback" aria-hidden="true">
    <div className="moon" /><div className="window-light" /><div className="furniture furniture-left" /><div className="furniture furniture-right" />
    <div className="scene-fallback-label">{scene}</div>
  </div>;
}

function SceneArt({ scene, failed, onError }: { scene: typeof scenes[number]; failed: boolean; onError: () => void }) {
  return <div className="scene-art">
    {failed ? <SceneFallback scene={scene.name} /> : <img src={`/scenes/${scene.id}.webp`} alt="" width={1600} height={900} decoding="async" fetchPriority="high" onError={onError} />}
  </div>;
}

function ItemIcon({ itemId, selected, onSelect }: { itemId: string; selected: boolean; onSelect: () => void }) {
  const Icon = itemIcons[itemId] ?? Package;
  return <button className={`inventory-slot ${selected ? "selected" : ""}`} onClick={onSelect} aria-label={`Select ${itemNames[itemId] ?? itemId}`} title={itemNames[itemId] ?? itemId}>
    <img src={`/items/${itemId}.webp`} alt="" width={40} height={40} decoding="async" onError={(event) => { event.currentTarget.style.display = "none"; }} />
    <Icon className="item-fallback-icon" size={24} aria-hidden="true" />
  </button>;
}

export default function GameShell({ initialView }: { initialView: "lobby" | "play" }) {
  const [state, dispatch] = useReducer(reducer, { ...initialState, view: initialView === "play" ? "booting" : "booting" });
  const [selectedPuzzle, setSelectedPuzzle] = useState<number | null>(null);
  const [hint, setHint] = useState("");
  const [sync, setSync] = useState("saved");
  const [displayedRemaining, setDisplayedRemaining] = useState(0);
  const [failedScenes, setFailedScenes] = useState<Record<string, boolean>>({});
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [showHotspotHints, setShowHotspotHints] = useState(false);
  const [debugHotspots, setDebugHotspots] = useState(false);
  const [pickupItem, setPickupItem] = useState<string | null>(null);
  const expiryCheckInFlight = useRef(false);
  const prefersReducedMotion = useReducedMotion();
  const patch = useCallback((data: Partial<State>) => dispatch({ type: "patch", ...data }), []);

  const request = useCallback(async <T,>(path: string, init?: RequestInit): Promise<{ data: T; serverNow: string }> => {
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const body = await response.json() as { ok?: boolean; data?: T; serverNow?: string; error?: { code?: string; message?: string; cooldownUntil?: string; reason?: string; serverState?: Save; revision?: number } };
    if (!response.ok || !body.ok) throw Object.assign(new Error(body.error?.message ?? "Request failed"), { code: body.error?.code, body });
    if (!body.data || !body.serverNow) throw new Error("Malformed server response.");
    return { data: body.data, serverNow: body.serverNow };
  }, []);

  const updateDisplayedRemaining = useCallback(() => {
    if (!state.session) { setDisplayedRemaining(0); return 0; }
    const remaining = Math.max(0, Math.ceil((Date.parse(state.session.authoritativeExpiry) - (Date.now() + state.serverOffset)) / 1000));
    setDisplayedRemaining(remaining);
    return remaining;
  }, [state.serverOffset, state.session]);

  const refreshStatus = useCallback(async () => {
    const status = await request<StatusData>("/api/session/status");
    const offset = Date.parse(status.serverNow) - Date.now();
    patch({ serverOffset: offset, cooldownUntil: status.data.cooldownUntil ?? null, reason: status.data.reason ?? null });
    if (status.data.state === "active") {
      patch({ view: "playing", session: status.data.session ?? null });
      return true;
    }
    if (state.view === "playing") patch({ view: "expired" });
    else patch({ view: status.data.state === "cooldown" ? "cooldown" : "lobby" });
    return false;
  }, [patch, request, state.view]);

  const boot = useCallback(async () => {
    try {
      const me = await fetch("/api/auth/me");
      if (!me.ok) { patch({ view: "loggedOut" }); return; }
      const meBody = await me.json() as { data?: { username?: string } };
      const status = await request<StatusData>("/api/session/status");
      const statusOffset = Date.parse(status.serverNow) - Date.now();
      patch({ username: meBody.data?.username ?? "", view: status.data.state === "active" ? "playing" : status.data.state === "cooldown" ? "cooldown" : "lobby", session: status.data.session ?? null, cooldownUntil: status.data.cooldownUntil ?? null, reason: status.data.reason ?? null, serverOffset: statusOffset });
      if (status.data.state === "active") {
        const save = await request<StateData>("/api/state");
        patch({ save: save.data.state, revision: save.data.revision, session: save.data.session, serverOffset: Date.parse(save.serverNow) - Date.now() });
      }
    } catch (error) { patch({ view: "fatal", message: error instanceof Error ? error.message : "Service unavailable." }); }
  }, [patch, request]);

  useEffect(() => { void boot(); }, [boot]);
  useEffect(() => {
    if (state.view !== "playing") return;
    const timer = setInterval(() => { void boot(); }, 30000);
    return () => clearInterval(timer);
  }, [boot, state.view]);
  useEffect(() => {
    if (state.view !== "playing" || !state.session) return;
    let zeroHandled = false;
    const tick = () => {
      const remaining = updateDisplayedRemaining();
      if (remaining === 0 && !zeroHandled && !expiryCheckInFlight.current) {
        zeroHandled = true;
        expiryCheckInFlight.current = true;
        void refreshStatus().then((active) => { if (active) zeroHandled = false; }).catch(() => undefined).finally(() => { expiryCheckInFlight.current = false; });
      }
    };
    const timer = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    tick();
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [refreshStatus, state.session, state.view, updateDisplayedRemaining]);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    setDebugHotspots(new URLSearchParams(window.location.search).get("debug") === "hotspots");
  }, []);
  useEffect(() => {
    if (state.view !== "playing") return;
    for (const scene of scenes) {
      const image = new Image();
      image.src = `/scenes/${scene.id}.webp`;
    }
  }, [state.view]);

  async function start(duration: number) {
    patch({ view: "starting", message: "" });
    try {
      const result = await request<StartData>("/api/session/start", { method: "POST", body: JSON.stringify({ duration }) });
      patch({ view: "playing", session: { sessionId: result.data.sessionId, duration: result.data.duration, startedAt: result.data.startedAt, authoritativeExpiry: result.data.authoritativeExpiry, status: result.data.status }, save: result.data.initialState, revision: 0, serverOffset: Date.parse(result.serverNow) - Date.now() });
    } catch (error) {
      const e = error as Error & { code?: string; body?: { error?: { cooldownUntil?: string; reason?: string } } };
      patch(e.code === "COOLDOWN_ACTIVE" ? { view: "cooldown", cooldownUntil: e.body?.error?.cooldownUntil ?? null, reason: e.body?.error?.reason ?? null } : e.code === "DEVICE_LIMIT" || e.code === "DEVICE_MISSING" ? { view: "device", message: e.message } : { view: "fatal", message: e.message });
    }
  }
  async function save(next: Save) {
    if (!state.save) return;
    setSync("saving");
    try {
      const result = await request<StateData>("/api/state", { method: "PUT", body: JSON.stringify({ revision: state.revision, state: next }) });
      patch({ save: result.data.state, revision: result.data.revision }); setSync("saved");
    } catch (error) {
      const e = error as Error & { code?: string; body?: { error?: { serverState?: Save; revision?: number } } };
      if (e.code === "SAVE_CONFLICT" && e.body?.error?.serverState) { patch({ save: e.body.error.serverState, revision: e.body.error.revision ?? state.revision }); setSync("conflict"); } else setSync("offline_retrying");
    }
  }
  async function inspectAndOpen(hotspot: Hotspot) {
    if (debugHotspots) {
      const rect = document.querySelector(`[data-hotspot="${hotspot.id}"]`)?.getBoundingClientRect();
      const stage = document.querySelector(".stage")?.getBoundingClientRect();
      if (rect && stage) console.debug(`[hotspot:${hotspot.id}] click center ${(100 * (rect.left + rect.width / 2 - stage.left) / stage.width).toFixed(2)}%, ${(100 * (rect.top + rect.height / 2 - stage.top) / stage.height).toFixed(2)}%`);
    }
    if (state.save && hotspot.objectId && !state.save.inspectedObjects.includes(hotspot.objectId)) await save({ ...state.save, inspectedObjects: [...state.save.inspectedObjects, hotspot.objectId] });
    const puzzleIndex = hotspot.puzzleId ? puzzles.findIndex((puzzle) => puzzle[0] === hotspot.puzzleId) : -1;
    setSelectedPuzzle(puzzleIndex >= 0 ? puzzleIndex : null);
  }
  async function solve(index: number, option: string) {
    if (!state.save) return;
    try {
      const result = await request<{ state: Save; revision: number }>("/api/puzzle/solve", { method: "POST", body: JSON.stringify({ puzzleId: puzzles[index][0], answer: option }) });
      const reward = puzzleById(puzzles[index][0])?.rewardItem;
      if (reward && !state.save.inventory.includes(reward)) { setPickupItem(reward); window.setTimeout(() => setPickupItem(null), prefersReducedMotion ? 0 : 800); }
      setSelectedPuzzle(null); patch({ save: result.data.state, revision: result.data.revision });
    } catch { /* incorrect answers stay in the modal */ }
  }
  async function useHint() {
    try {
      const result = await request<HintData>("/api/hint", { method: "POST", body: JSON.stringify({}) });
      setHint(result.data.hint); if (state.save) patch({ save: { ...state.save, hintCount: result.data.hintCount }, revision: result.data.revision });
    } catch (error) { setHint(error instanceof Error ? error.message : "No hint available."); }
  }
  async function complete() {
    try { const result = await request<{ score: number }>("/api/session/complete", { method: "POST" }); patch({ view: "completed", score: result.data.score }); }
    catch (error) { setHint(error instanceof Error ? error.message : "The server has not accepted the case yet."); }
  }

  if (state.view === "booting" || state.view === "starting") return <main className="screen"><RefreshCw className="spin" /><h1>{state.view === "starting" ? "Opening the case..." : "Waking the observatory..."}</h1></main>;
  if (state.view === "loggedOut") return <main className="screen"><h1>Investigation closed</h1><a className="button" href="/login">Sign in</a></main>;
  if (state.view === "fatal") return <main className="screen"><ShieldAlert size={48} /><h1>Service unavailable</h1><p>{state.message}</p><button onClick={boot}>Retry</button></main>;
  if (state.view === "device") return <main className="screen"><ShieldAlert size={48} /><h1>Device access blocked</h1><p>{state.message || "Enable cookies and retry. A registered device is required."}</p><button onClick={boot}>Retry</button></main>;
  if (state.view === "cooldown") {
    const remaining = state.cooldownUntil ? Math.max(0, Math.ceil((Date.parse(state.cooldownUntil) - (Date.now() + state.serverOffset)) / 1000)) : 0;
    return <main className="screen"><Clock3 size={48} /><h1>Cooldown lock</h1><p>{state.reason ?? "Session ended"} · {formatRemaining(remaining)}</p><button onClick={boot}>Check again</button></main>;
  }
  if (state.view === "lobby") return <main className="lobby"><header><p className="eyebrow">CASE FILE 07</p><h1>Choose your investigation</h1><p>Welcome, {state.username}. The database clock is the only clock that matters.</p></header><section className="level-grid">{state.levels.map((level) => <article className="card level-card" key={level.key}><h2>{level.key}</h2><strong>{level.durationMinutes} minutes</strong><p>{level.stages} scene{level.stages > 1 ? "s" : ""} · {level.puzzleCount} puzzles · {level.maxHints} hints</p><button onClick={() => start(level.durationMinutes)}>Start case</button></article>)}</section></main>;
  if (state.view === "expired") return <main className="screen"><Clock3 size={48} /><h1>Time&apos;s up</h1><p>The server confirmed that this session has ended.</p><button onClick={boot}>Continue</button></main>;
  if (state.view === "completed") return <main className="screen"><p className="eyebrow">CASE CLOSED</p><h1>Dr. Hale&apos;s trail continues</h1><p>Server-computed score: <strong>{state.score ?? 0}</strong></p><a className="button" href="/lobby">Return to lobby</a></main>;
  if (!state.save || !state.session) return <main className="screen"><h1>No active case</h1><button onClick={boot}>Return</button></main>;

  const stage = Math.min(5, state.save.currentStage);
  const scene = scenes[stage - 1];
  const stageHotspots = HOTSPOTS[stage] ?? [];
  const required = state.session.duration === 10 ? 2 : state.session.duration === 15 ? 3 : state.session.duration === 30 ? 4 : state.session.duration === 60 ? 5 : 6;
  const inventory = state.save.inventory;
  return <main className="game-shell">
    <header className="game-header"><div><p className="eyebrow">THE VANISHING OF DR. HALE</p><h1>{scene.name}</h1><p className="level-name">{state.session.duration}-minute investigation</p></div><div className={`countdown ${displayedRemaining < 60 ? "danger" : displayedRemaining < 300 ? "warn" : ""}`} aria-live="polite"><Clock3 size={18} /> {formatRemaining(displayedRemaining)}</div></header>
    <div className="stage-wrap"><motion.section className={`stage ${debugHotspots ? "debug-hotspots" : ""}`} key={scene.id} initial={prefersReducedMotion ? false : { opacity: 0, scale: 1.03 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: prefersReducedMotion ? 0 : 0.55 }}>
      <SceneArt scene={scene} failed={failedScenes[scene.id] === true} onError={() => setFailedScenes((current) => ({ ...current, [scene.id]: true }))} />
      <div className="vignette" /><div className="warm-glow" /><div className="dust" aria-hidden="true" />
      <div className="scene-title">{scene.name}</div>
      {stageHotspots.map((hotspot) => <button data-hotspot={hotspot.id} className={`hotspot ${showHotspotHints ? "hint-pulse" : ""}`} style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%`, width: `${hotspot.width}%`, height: `${hotspot.height}%` }} key={hotspot.id} onClick={() => void inspectAndOpen(hotspot)} aria-label={hotspot.label} title={hotspot.label}><span>{hotspot.label}</span></button>)}
      {debugHotspots && <div className="debug-label">DEBUG: hotspots</div>}
    </motion.section></div>
    <footer className="hud"><div className="inventory"><span className="hud-label"><Backpack size={17} /> Evidence</span>{inventory.length === 0 && <span className="empty-slot">Empty</span>}{inventory.map((itemId) => <ItemIcon key={itemId} itemId={itemId} selected={selectedItem === itemId} onSelect={() => setSelectedItem(itemId)} />)}{pickupItem && <motion.span className="pickup-fly" initial={{ opacity: 0, y: 8, scale: 0.6 }} animate={{ opacity: 1, y: -26, scale: 1.1 }} exit={{ opacity: 0 }}>{itemNames[pickupItem]}</motion.span>}</div><span className="sync">{sync}</span><button onClick={useHint}><Lightbulb size={17} /> Hint ({state.save.hintCount})</button><button onClick={() => { setShowHotspotHints(true); window.setTimeout(() => setShowHotspotHints(false), 2000); }}>Hint hotspots</button>{state.save.solvedPuzzles.length >= required && <button onClick={() => void complete()}>Close case</button>}<button onClick={() => { if (window.confirm("Abandon this case? Cooldown will apply.")) void request("/api/session/abandon", { method: "POST" }).then(() => patch({ view: "cooldown" })); }}>Abandon</button></footer>
    {selectedItem && <div className="selected-item card"><strong>{itemNames[selectedItem] ?? selectedItem}</strong><button className="secondary" onClick={() => setSelectedItem(null)}>Deselect</button></div>}
    {hint && <div className="hint card"><Lightbulb size={18} /><span>{hint}</span></div>}
    <AnimatePresence>{selectedPuzzle !== null && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div className="card modal" initial={prefersReducedMotion ? false : { y: 30 }} animate={{ y: 0 }}><p className="eyebrow">EVIDENCE REVIEW</p><h2>{puzzles[selectedPuzzle][1]}</h2><p>{puzzleById(puzzles[selectedPuzzle][0])?.prompt}</p>{puzzles[selectedPuzzle][2].map((option) => <button key={option} onClick={() => void solve(selectedPuzzle, option)}>{option}</button>)}<button className="secondary" onClick={() => setSelectedPuzzle(null)}>Close</button></motion.div></motion.div>}</AnimatePresence>
  </main>;
}
