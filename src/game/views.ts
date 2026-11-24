import type { Socket } from "socket.io-client";
import { Sim } from "@/shared/sim";
import { DT } from "@/shared/constants";
import type {
  DeathCause,
  GameStatePayload,
  InputState,
  LevelData,
  LevelLoadedPayload,
  NetState,
} from "@/shared/types";

export type ViewEvent =
  | { type: "died"; cause: DeathCause }
  | { type: "won" }
  | { type: "respawned" }
  | { type: "loaded" };

/** What the Phaser scene renders. The scene never decides game outcomes itself. */
export interface GameView {
  readonly mode: "live" | "local";
  levelKey: number;
  level: LevelData | null;
  net: NetState | null;
  smooth: boolean;
  canControl: boolean;
  playerName: string;
  /** on-screen touch control state, merged with the keyboard by the scene */
  touch: InputState;
  setInput(i: InputState): void;
  update(dtMs: number): void;
  drainEvents(): ViewEvent[];
  destroy(): void;
}

const ZERO: InputState = { left: false, right: false, jump: false };
const same = (a: InputState, b: InputState) => a.left === b.left && a.right === b.right && a.jump === b.jump;

abstract class BaseView {
  levelKey = 0;
  level: LevelData | null = null;
  net: NetState | null = null;
  touch: InputState = { ...ZERO };
  protected events: ViewEvent[] = [];
  drainEvents(): ViewEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}

/** Spectator / active-player view driven purely by server messages. */
export class LiveView extends BaseView implements GameView {
  readonly mode = "live" as const;
  smooth = true;
  canControl = false;
  playerName = "";
  private lastSent: InputState = { ...ZERO };
  private current: InputState = { ...ZERO };
  private handlers: [string, (...a: never[]) => void][] = [];

  constructor(private readonly socket: Socket) {
    super();
    const on = <T,>(ev: string, fn: (p: T) => void) => {
      socket.on(ev, fn as never);
      this.handlers.push([ev, fn as never]);
    };
    on<LevelLoadedPayload>("game:level-loaded", (p) => {
      this.level = p.level;
      this.net = null;
      this.levelKey++;
      this.events.push({ type: "loaded" });
      this.resend();
    });
    on<GameStatePayload>("game:state", (p) => {
      const prev = this.net?.st ?? 0;
      this.net = p.s;
      if (prev === 0 && p.s.st === 1) {
        /* the cause arrives with game:player-died */
      }
      if (prev === 1 && p.s.st === 0) {
        this.events.push({ type: "respawned" });
        this.resend();
      }
      if (prev !== 2 && p.s.st === 2) this.events.push({ type: "won" });
    });
    on<{ cause: DeathCause }>("game:player-died", (p) => this.events.push({ type: "died", cause: p.cause }));
    on<{ turn: unknown }>("game:player-changed", (p) => {
      this.lastSent = { ...ZERO };
      if (!p.turn) {
        this.level = null;
        this.net = null;
        this.levelKey++;
      }
    });
    on<unknown>("connect", () => socket.emit("game:ready"));
    socket.emit("game:ready");
  }

  private resend() {
    this.lastSent = { ...ZERO };
    this.setInput(this.current);
  }

  setInput(i: InputState) {
    this.current = i;
    if (!this.canControl) return;
    if (same(i, this.lastSent)) return;
    this.lastSent = { ...i };
    this.socket.emit("game:input", { left: i.left, right: i.right, jump: i.jump });
  }
  update() {}
  destroy() {
    for (const [ev, fn] of this.handlers) this.socket.off(ev, fn as never);
    this.handlers = [];
  }
}

export interface LocalCallbacks {
  onDeath?: (cause: DeathCause, deaths: number) => void;
  onWin?: (ms: number, deaths: number) => void;
}

/** Client-side practice / editor-test view running the shared deterministic simulation. */
export class LocalView extends BaseView implements GameView {
  readonly mode = "local" as const;
  smooth = false;
  canControl = true;
  playerName = "You";
  deaths = 0;
  won = false;
  private sim: Sim;
  private acc = 0;
  private input: InputState = { ...ZERO };

  constructor(
    level: LevelData,
    private readonly cb: LocalCallbacks = {},
  ) {
    super();
    this.sim = new Sim(level);
    this.level = level;
    this.levelKey = 1;
    this.net = this.sim.netState();
  }

  restart() {
    this.sim.reset();
    this.deaths = 0;
    this.won = false;
    this.net = this.sim.netState();
    this.levelKey++;
  }

  setInput(i: InputState) {
    this.input = { ...i };
  }

  update(dtMs: number) {
    if (this.won) return;
    this.acc += Math.min(dtMs, 100) / 1000;
    while (this.acc >= DT) {
      this.acc -= DT;
      for (const ev of this.sim.step(this.input)) {
        if (ev.type === "died") {
          this.deaths++;
          this.events.push({ type: "died", cause: ev.cause });
          this.cb.onDeath?.(ev.cause, this.deaths);
        } else if (ev.type === "won") {
          this.won = true;
          this.events.push({ type: "won" });
          this.cb.onWin?.(Math.round(this.sim.tick * DT * 1000), this.deaths);
        } else this.events.push({ type: "respawned" });
      }
    }
    this.net = this.sim.netState();
  }
  destroy() {}
}
