import { LIVES_FEW_WAITING, LIVES_MANY_WAITING, WAITING_THRESHOLD } from "@/shared/constants";
import type { EndReason, QueueSnapshot, TurnView } from "@/shared/types";

export interface QueueEntry {
  userId: string;
  username: string;
  joinedAt: number;
}

export interface Turn extends TurnView {
  lastActivityAt: number;
}

export interface TurnEvents {
  onQueueChanged(): void;
  onTurnStarted(turn: Turn): void;
  onTurnEnded(turn: Turn, reason: EndReason): void;
  onLifeLost?(turn: Turn): void;
  onWaitingDropped?(userId: string): void;
}

export interface TurnManagerOptions {
  now?: () => number;
  /** Max duration of a turn while others are waiting. */
  maxTurnMs?: number;
  /** Max time without input while others are waiting. */
  afkMs?: number;
  /** How long an active player may be disconnected before losing the turn. */
  activeGraceMs?: number;
  /** How long a waiting player may be disconnected before losing their spot. */
  waitingGraceMs?: number;
  avgTurnMs?: () => number | null;
  maxQueue?: number;
  newId?: () => string;
}

export type JoinResult =
  | { ok: true; position: number }
  | { ok: false; error: "already-queued" | "already-active" | "queue-full" };

/**
 * Authoritative queue + turn lock. There is exactly one `active` slot, and only
 * `startNextTurn` can fill it (and only when it is empty), so two players can
 * never control the game simultaneously. Pure logic: no sockets, no timers —
 * time is injected and `tick()` is driven by the game loop, which keeps it testable.
 */
export class TurnManager {
  private queue: QueueEntry[] = [];
  private active: Turn | null = null;
  private disconnectedAt = new Map<string, number>();
  private readonly now: () => number;
  private readonly o: Required<Omit<TurnManagerOptions, "now" | "avgTurnMs" | "newId">>;
  private readonly avg: () => number | null;
  private readonly newId: () => string;
  private idCounter = 0;

  constructor(
    private readonly events: TurnEvents,
    opts: TurnManagerOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.avg = opts.avgTurnMs ?? (() => null);
    this.newId = opts.newId ?? (() => `turn-${Date.now().toString(36)}-${++this.idCounter}`);
    this.o = {
      maxTurnMs: opts.maxTurnMs ?? 5 * 60_000,
      afkMs: opts.afkMs ?? 45_000,
      activeGraceMs: opts.activeGraceMs ?? 15_000,
      waitingGraceMs: opts.waitingGraceMs ?? 45_000,
      maxQueue: opts.maxQueue ?? 200,
    };
  }

  /** The exact life rule: more than 5 waiting => 5 lives, otherwise 10. */
  static livesFor(waitingCount: number): number {
    return waitingCount > WAITING_THRESHOLD ? LIVES_MANY_WAITING : LIVES_FEW_WAITING;
  }

  get activeTurn(): Turn | null {
    return this.active;
  }
  get waiting(): readonly QueueEntry[] {
    return this.queue;
  }
  isActive(userId: string): boolean {
    return this.active?.userId === userId;
  }
  isQueued(userId: string): boolean {
    return this.queue.some((e) => e.userId === userId);
  }
  positionOf(userId: string): number | null {
    if (this.isActive(userId)) return 0;
    const i = this.queue.findIndex((e) => e.userId === userId);
    return i === -1 ? null : i + 1;
  }

  join(userId: string, username: string): JoinResult {
    if (this.isActive(userId)) return { ok: false, error: "already-active" };
    if (this.isQueued(userId)) return { ok: false, error: "already-queued" };
    if (this.queue.length >= this.o.maxQueue) return { ok: false, error: "queue-full" };
    this.queue.push({ userId, username, joinedAt: this.now() });
    this.disconnectedAt.delete(userId);
    if (!this.active) this.startNextTurn();
    else this.events.onQueueChanged();
    return { ok: true, position: this.positionOf(userId) ?? 0 };
  }

  leave(userId: string): { ok: boolean; wasActive: boolean } {
    if (this.isActive(userId)) {
      this.endTurn("left");
      return { ok: true, wasActive: true };
    }
    const i = this.queue.findIndex((e) => e.userId === userId);
    if (i === -1) return { ok: false, wasActive: false };
    this.queue.splice(i, 1);
    this.disconnectedAt.delete(userId);
    this.events.onQueueChanged();
    return { ok: true, wasActive: false };
  }

  /** Promote the head of the queue. No-op while a turn is running (the turn lock). */
  startNextTurn(): Turn | null {
    if (this.active) return null;
    let entry: QueueEntry | undefined;
    while ((entry = this.queue.shift())) {
      if (!this.disconnectedAt.has(entry.userId)) break;
      this.disconnectedAt.delete(entry.userId); // dropped: not connected
      this.events.onWaitingDropped?.(entry.userId);
      entry = undefined;
    }
    if (!entry) {
      this.events.onQueueChanged();
      return null;
    }
    const waiting = this.queue.length;
    const lives = TurnManager.livesFor(waiting); // fixed for the whole turn
    const now = this.now();
    this.active = {
      turnId: this.newId(),
      userId: entry.userId,
      username: entry.username,
      lives,
      maxLives: lives,
      level: 1,
      deaths: 0,
      levelsCompleted: 0,
      startedAt: now,
      queueSizeAtStart: waiting,
      lastActivityAt: now,
    };
    this.events.onTurnStarted(this.active);
    this.events.onQueueChanged();
    return this.active;
  }

  endTurn(reason: EndReason): Turn | null {
    const turn = this.active;
    if (!turn) return null;
    this.active = null;
    this.disconnectedAt.delete(turn.userId);
    this.events.onTurnEnded(turn, reason);
    this.startNextTurn();
    return turn;
  }

  /** Server-side life loss. Ends the turn when lives hit zero. Returns remaining lives. */
  loseLife(userId: string): number | null {
    const t = this.active;
    if (!t || t.userId !== userId || t.lives <= 0) return null;
    t.lives -= 1;
    t.deaths += 1;
    this.events.onLifeLost?.(t);
    if (t.lives === 0) {
      this.endTurn("lives-exhausted");
      return 0;
    }
    this.events.onQueueChanged();
    return t.lives;
  }

  completeLevel(userId: string): void {
    const t = this.active;
    if (!t || t.userId !== userId) return;
    t.levelsCompleted += 1;
    t.level += 1;
  }

  touchActivity(userId: string): void {
    if (this.active?.userId === userId) this.active.lastActivityAt = this.now();
  }

  setConnected(userId: string, connected: boolean): void {
    if (connected) this.disconnectedAt.delete(userId);
    else if (this.isActive(userId) || this.isQueued(userId)) {
      if (!this.disconnectedAt.has(userId)) this.disconnectedAt.set(userId, this.now());
    }
  }

  /** Drives all time based rules. Call about once per second. */
  tick(): void {
    const now = this.now();
    const a = this.active;
    let changed = false;
    // expired waiting players
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const at = this.disconnectedAt.get(this.queue[i].userId);
      if (at !== undefined && now - at >= this.o.waitingGraceMs) {
        const dropped = this.queue[i].userId;
        this.disconnectedAt.delete(dropped);
        this.queue.splice(i, 1);
        this.events.onWaitingDropped?.(dropped);
        changed = true;
      }
    }
    if (changed) this.events.onQueueChanged();
    if (!a) {
      if (this.queue.length) this.startNextTurn();
      return;
    }
    const dc = this.disconnectedAt.get(a.userId);
    if (dc !== undefined && now - dc >= this.o.activeGraceMs) {
      this.endTurn("disconnected");
      return;
    }
    if (this.queue.length > 0) {
      if (now - a.startedAt >= this.o.maxTurnMs) this.endTurn("timeout");
      else if (now - a.lastActivityAt >= this.o.afkMs) this.endTurn("afk");
    }
  }

  snapshot(): QueueSnapshot {
    const now = this.now();
    const avg = this.avg();
    const a = this.active;
    const remaining = a && avg !== null ? Math.max(0, avg - (now - a.startedAt)) : 0;
    return {
      active: a ? stripTurn(a) : null,
      queue: this.queue.map((e, i) => ({
        userId: e.userId,
        username: e.username,
        position: i + 1,
        etaMs: avg === null ? null : Math.round(remaining + i * avg),
      })),
      waitingCount: this.queue.length,
      avgTurnMs: avg,
      serverTime: now,
      status: a ? "playing" : "idle",
    };
  }

  /** Restore waiting entries after a restart (all start as disconnected until they reconnect). */
  restore(entries: QueueEntry[]): void {
    if (this.active || this.queue.length) return;
    for (const e of entries) {
      this.queue.push(e);
      this.disconnectedAt.set(e.userId, this.now());
    }
  }
}

export function stripTurn(t: Turn): TurnView {
  const { lastActivityAt: _ignored, ...view } = t;
  void _ignored;
  return view;
}
