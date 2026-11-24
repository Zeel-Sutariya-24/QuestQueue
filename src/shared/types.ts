// Shared type definitions used by the browser, the game server and tests.

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Moving platform. Coordinates in tiles; speed in tiles per second. */
export interface MoverDef {
  x: number;
  y: number;
  w: number;
  axis: "x" | "y";
  range: number;
  speed: number;
}
export interface FallerDef {
  x: number;
  y: number;
  w: number;
}

/**
 * Structured, data-only level description. Never contains executable code.
 * Spawn / exit / fake door (x, y) = the tile cell where the feet rest.
 */
export interface LevelData {
  v: 1;
  width: number;
  height: number;
  spawn: Pt;
  exit: Pt;
  solids: Rect[];
  spikes: Pt[];
  pits: Pt[];
  hidden: Pt[];
  movers: MoverDef[];
  fallers: FallerDef[];
  fakeDoors: Pt[];
}

export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
}

export type DeathCause = "spike" | "pit" | "hidden-trap" | "fake-door" | "fall";

export type SimEvent =
  | { type: "died"; cause: DeathCause }
  | { type: "won" }
  | { type: "respawned" };

/** Compact network snapshot of the simulation. */
export interface NetState {
  tk: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  f: 1 | -1;
  /** 0 alive, 1 dead, 2 won */
  st: 0 | 1 | 2;
  g: 0 | 1;
  /** platform positions [x0,y0,x1,y1...] movers first, then fallers (px) */
  pl: number[];
  /** indices of revealed hidden traps */
  hd: number[];
  /** faller trigger timers */
  ft: number[];
}

// ---------- Socket payloads ----------
export type LevelSource = "procedural" | "community" | "seed";

export interface LevelLoadedPayload {
  level: LevelData;
  number: number;
  name: string;
  source: LevelSource;
  levelId: string | null;
  creator: string | null;
  difficulty: number;
}

export interface TurnView {
  turnId: string;
  userId: string;
  username: string;
  lives: number;
  maxLives: number;
  level: number;
  deaths: number;
  levelsCompleted: number;
  startedAt: number;
  queueSizeAtStart: number;
}

export interface QueueEntryView {
  userId: string;
  username: string;
  position: number;
  etaMs: number | null;
}

export interface QueueSnapshot {
  active: TurnView | null;
  queue: QueueEntryView[];
  waitingCount: number;
  avgTurnMs: number | null;
  serverTime: number;
  status: "idle" | "playing" | "transition";
}

export interface GameStatePayload {
  s: NetState;
  progress: number;
}

export interface AckOk<T = unknown> {
  ok: true;
  data?: T;
}
export interface AckErr {
  ok: false;
  error: string;
}
export type Ack<T = unknown> = AckOk<T> | AckErr;

export type EndReason =
  | "lives-exhausted"
  | "timeout"
  | "afk"
  | "disconnected"
  | "left"
  | "shutdown";
