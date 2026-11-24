import crypto from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  BROADCAST_EVERY,
  SERVER_TICK_HZ,
  TILE,
} from "@/shared/constants";
import { generateValidatedLevel } from "@/shared/generator";
import { Sim } from "@/shared/sim";
import type {
  DeathCause,
  EndReason,
  GameStatePayload,
  InputState,
  LevelLoadedPayload,
} from "@/shared/types";
import { stripTurn, TurnManager, type Turn } from "../queue/TurnManager";
import type { StateMirror } from "../redis";
import { ensureSeedLevels, loadPlayablePool, type PoolLevel } from "../services/levels";
import * as stats from "../services/stats";

const ZERO: InputState = { left: false, right: false, jump: false };
const TRANSITION_MS = 1600;

/**
 * Server-authoritative game: owns the TurnManager (who may play), runs the
 * physics simulation for the active player and broadcasts state to everyone.
 * Clients only ever send input *intent*; positions come from the server sim.
 */
export class GameServer {
  readonly manager: TurnManager;
  private sim: Sim | null = null;
  private meta: LevelLoadedPayload | null = null;
  private input: InputState = { ...ZERO };
  private phase: "idle" | "playing" | "transition" = "idle";
  private transitionAt = 0;
  private lastLoop = Date.now();
  private acc = 0;
  private ticks = 0;
  private lastMgrTick = 0;
  private lastQueueEmit = 0;
  private pool: PoolLevel[] = [];
  private avgTurnMs: number | null = null;
  private lastDeathCause: DeathCause = "spike";
  private seeded = false;
  private timer: NodeJS.Timeout | null = null;
  private connections = new Map<string, number>();

  constructor(
    readonly io: Server,
    private readonly mirror: StateMirror,
  ) {
    this.manager = new TurnManager(
      {
        onQueueChanged: () => this.broadcastQueue(),
        onTurnStarted: (t) => this.handleTurnStarted(t),
        onTurnEnded: (t, r) => this.handleTurnEnded(t, r),
        onLifeLost: (t) => this.handleLifeLost(t),
        onWaitingDropped: (uid) => stats.bgQueueLeft(uid, "expired"),
      },
      { avgTurnMs: () => this.avgTurnMs, newId: () => crypto.randomUUID() },
    );
  }

  async init(): Promise<void> {
    const queue = await this.mirror.loadQueue();
    if (queue.length) this.manager.restore(queue);
    await this.refreshPool();
    await this.refreshAvg();
    this.timer = setInterval(() => this.loop(), Math.floor(1000 / SERVER_TICK_HZ));
    setInterval(() => void this.refreshPool(), 30_000).unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async refreshPool(): Promise<void> {
    try {
      if (!this.seeded) {
        await ensureSeedLevels();
        this.seeded = true;
      }
      this.pool = await loadPlayablePool();
    } catch (e) {
      console.warn("[game] level pool refresh failed:", (e as Error).message);
    }
  }

  private async refreshAvg() {
    try {
      this.avgTurnMs = await stats.getAvgTurnMs();
    } catch {
      /* keep previous value */
    }
  }

  // ---------- presence ----------
  connect(userId: string | null) {
    if (!userId) return;
    this.connections.set(userId, (this.connections.get(userId) ?? 0) + 1);
    this.manager.setConnected(userId, true);
  }
  disconnect(userId: string | null) {
    if (!userId) return;
    const n = (this.connections.get(userId) ?? 1) - 1;
    if (n <= 0) {
      this.connections.delete(userId);
      this.manager.setConnected(userId, false);
    } else this.connections.set(userId, n);
  }

  // ---------- queue API (called by socket handlers) ----------
  joinQueue(userId: string, username: string) {
    const known = this.manager.isActive(userId) || this.manager.isQueued(userId);
    if (!known) stats.bgQueueJoined(userId); // ordered before session start by the db chain
    const res = this.manager.join(userId, username);
    if (!res.ok && !known) stats.bgQueueLeft(userId);
    return res;
  }

  leaveQueue(userId: string) {
    const res = this.manager.leave(userId);
    if (res.ok && !res.wasActive) stats.bgQueueLeft(userId);
    return res;
  }

  /** Validate + apply player intent. Returns false when the sender may not control the game. */
  handleInput(userId: string, input: InputState): boolean {
    const turn = this.manager.activeTurn;
    if (!turn || turn.userId !== userId || !this.sim) return false; // spectators are ignored
    if (this.phase !== "playing" || this.sim.p.status !== 0) {
      this.input = { ...ZERO }; // dead players cannot send valid movement
      return false;
    }
    this.input = { left: input.left, right: input.right, jump: input.jump };
    if (input.left || input.right || input.jump) this.manager.touchActivity(userId);
    return true;
  }

  // ---------- broadcasting ----------
  broadcastQueue() {
    this.lastQueueEmit = Date.now();
    this.io.emit("queue:updated", this.manager.snapshot());
    void this.mirror.saveQueue([...this.manager.waiting]);
  }

  /** Full state for a freshly connected / refreshed client. */
  sendSync(socket: Socket) {
    const turn = this.manager.activeTurn;
    socket.emit("queue:updated", this.manager.snapshot());
    socket.emit("game:player-changed", { turn: turn ? stripTurn(turn) : null });
    if (turn && this.meta && this.sim) {
      socket.emit("game:level-loaded", this.meta);
      socket.emit("game:lives-updated", { lives: turn.lives, maxLives: turn.maxLives, deaths: turn.deaths });
      socket.emit("game:state", this.statePayload());
    }
  }

  private statePayload(): GameStatePayload {
    const sim = this.sim!;
    const exitX = this.meta ? this.meta.level.exit.x * TILE : 1;
    const progress = Math.max(0, Math.min(1, sim.p.x / Math.max(1, exitX)));
    return { s: sim.netState(), progress: Math.round(progress * 1000) / 1000 };
  }

  // ---------- turn lifecycle ----------
  private handleTurnStarted(t: Turn) {
    void this.mirror.acquireTurnLock(t.turnId, 10 * 60_000);
    void this.mirror.setActive({ userId: t.userId, turnId: t.turnId, startedAt: t.startedAt });
    stats.bgStartSession(t);
    stats.recordEvent(t.turnId, t.userId, "turn_started", {
      lives: t.maxLives,
      queueSizeAtStart: t.queueSizeAtStart,
    });
    this.input = { ...ZERO };
    this.io.emit("game:player-changed", { turn: stripTurn(t) });
    this.io.emit("game:started", { turn: stripTurn(t) });
    this.loadLevel(t);
  }

  private handleTurnEnded(t: Turn, reason: EndReason) {
    this.sim = null;
    this.meta = null;
    this.phase = "idle";
    this.input = { ...ZERO };
    void this.mirror.releaseTurnLock(t.turnId);
    void this.mirror.setActive(null);
    void this.mirror.saveGameState(null);
    stats.bgEndSession(t, reason);
    stats.recordEvent(t.turnId, t.userId, "turn_ended", {
      reason,
      levelsCompleted: t.levelsCompleted,
      deaths: t.deaths,
    });
    this.io.emit("game:ended", {
      userId: t.userId,
      username: t.username,
      reason,
      levelsCompleted: t.levelsCompleted,
      deaths: t.deaths,
    });
    this.io.emit("game:player-changed", { turn: null });
    setTimeout(() => void this.refreshAvg(), 1500);
  }

  private handleLifeLost(t: Turn) {
    this.io.emit("game:player-died", {
      userId: t.userId,
      cause: this.lastDeathCause,
      lives: t.lives,
      deaths: t.deaths,
    });
    this.io.emit("game:lives-updated", { lives: t.lives, maxLives: t.maxLives, deaths: t.deaths });
    stats.recordEvent(
      t.turnId,
      t.userId,
      "player_died",
      { cause: this.lastDeathCause, level: t.level, livesLeft: t.lives },
      this.meta?.levelId ?? null,
    );
    if (this.meta?.levelId) stats.bumpLevel(this.meta.levelId, "deaths");
  }

  private loadLevel(t: Turn) {
    let payload: LevelLoadedPayload;
    const useCommunity = t.level >= 2 && this.pool.length > 0 && Math.random() < 0.4;
    if (useCommunity) {
      const pick = this.pool[Math.floor(Math.random() * this.pool.length)];
      payload = {
        level: pick.data,
        number: t.level,
        name: pick.name,
        source: pick.source === "seed" ? "seed" : "community",
        levelId: pick.id,
        creator: pick.creator,
        difficulty: pick.difficulty,
      };
      stats.bumpLevel(pick.id, "plays");
    } else {
      const g = generateValidatedLevel(t.level, crypto.randomInt(1, 2 ** 30));
      payload = {
        level: g.level,
        number: t.level,
        name: `Procedural #${t.level}`,
        source: "procedural",
        levelId: null,
        creator: null,
        difficulty: Math.min(5, 1 + Math.floor(t.level / 3)),
      };
    }
    this.meta = payload;
    this.sim = new Sim(payload.level);
    this.phase = "playing";
    this.acc = 0;
    this.lastLoop = Date.now();
    this.io.emit("game:level-loaded", payload);
    this.io.emit("game:state", this.statePayload());
  }

  // ---------- main loop ----------
  private loop() {
    const now = Date.now();
    if (now - this.lastMgrTick >= 1000) {
      this.lastMgrTick = now;
      this.manager.tick();
      if (now - this.lastQueueEmit >= 5000) this.broadcastQueue();
    }
    const turn = this.manager.activeTurn;
    if (!turn || !this.sim) {
      this.lastLoop = now;
      this.acc = 0;
      return;
    }
    if (this.phase === "transition") {
      this.lastLoop = now;
      if (now >= this.transitionAt) this.loadLevel(turn);
      return;
    }
    this.acc += Math.min(now - this.lastLoop, 100);
    this.lastLoop = now;
    const stepMs = 1000 / SERVER_TICK_HZ;
    while (this.acc >= stepMs) {
      this.acc -= stepMs;
      this.stepOnce(turn);
      if (this.manager.activeTurn?.turnId !== turn.turnId || this.phase !== "playing" || !this.sim) break;
    }
  }

  private stepOnce(turn: Turn) {
    const sim = this.sim!;
    if (this.input.left || this.input.right || this.input.jump) this.manager.touchActivity(turn.userId);
    const events = sim.step(this.input);
    this.ticks++;
    let important = false;
    for (const ev of events) {
      if (ev.type === "died") {
        important = true;
        this.lastDeathCause = ev.cause;
        this.input = { ...ZERO };
        this.io.emit("game:state", this.statePayload());
        this.manager.loseLife(turn.userId); // may end the turn (lives === 0)
        if (this.manager.activeTurn?.turnId !== turn.turnId) return;
      } else if (ev.type === "won") {
        important = true;
        const completed = turn.level;
        this.manager.completeLevel(turn.userId);
        this.io.emit("game:state", this.statePayload());
        this.io.emit("game:level-completed", {
          number: completed,
          levelsCompleted: turn.levelsCompleted,
          next: turn.level,
        });
        stats.recordEvent(turn.turnId, turn.userId, "level_completed", { level: completed }, this.meta?.levelId ?? null);
        if (this.meta?.levelId) stats.bumpLevel(this.meta.levelId, "completions");
        this.phase = "transition";
        this.transitionAt = Date.now() + TRANSITION_MS;
        return;
      } else if (ev.type === "respawned") {
        important = true;
      }
    }
    if (important || this.ticks % BROADCAST_EVERY === 0) {
      this.io.volatile.emit("game:state", this.statePayload());
    }
  }
}
