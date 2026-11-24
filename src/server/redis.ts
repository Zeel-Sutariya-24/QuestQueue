import Redis from "ioredis";
import type { QueueEntry } from "./queue/TurnManager";

/**
 * Optional Redis mirror for the live queue, the active turn and the turn lock.
 * The in-process TurnManager is the single writer; Redis lets the queue survive
 * restarts and exposes the active turn / lock to other services. If REDIS_URL is
 * not configured (or Redis is down) everything keeps working in memory.
 */
export interface StateMirror {
  readonly enabled: boolean;
  saveQueue(entries: QueueEntry[]): Promise<void>;
  loadQueue(): Promise<QueueEntry[]>;
  setActive(turn: { userId: string; turnId: string; startedAt: number } | null): Promise<void>;
  acquireTurnLock(turnId: string, ttlMs: number): Promise<boolean>;
  releaseTurnLock(turnId: string): Promise<void>;
  saveGameState(state: Record<string, unknown> | null): Promise<void>;
}

const KEYS = {
  queue: "pq:queue",
  active: "pq:active",
  lock: "pq:turn-lock",
  game: "pq:game-state",
};

class NoopMirror implements StateMirror {
  enabled = false;
  async saveQueue() {}
  async loadQueue() {
    return [];
  }
  async setActive() {}
  async acquireTurnLock() {
    return true;
  }
  async releaseTurnLock() {}
  async saveGameState() {}
}

class RedisMirror implements StateMirror {
  enabled = true;
  constructor(private readonly r: Redis) {}

  private async safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      console.warn("[redis] operation failed:", (e as Error).message);
      return fallback;
    }
  }

  saveQueue(entries: QueueEntry[]) {
    return this.safe(async () => {
      const p = this.r.multi().del(KEYS.queue);
      if (entries.length) p.rpush(KEYS.queue, ...entries.map((e) => JSON.stringify(e)));
      await p.exec();
    }, undefined);
  }
  loadQueue() {
    return this.safe(async () => {
      const raw = await this.r.lrange(KEYS.queue, 0, -1);
      return raw.map((s) => JSON.parse(s) as QueueEntry);
    }, [] as QueueEntry[]);
  }
  setActive(turn: { userId: string; turnId: string; startedAt: number } | null) {
    return this.safe(async () => {
      if (turn) await this.r.set(KEYS.active, JSON.stringify(turn));
      else await this.r.del(KEYS.active);
    }, undefined);
  }
  acquireTurnLock(turnId: string, ttlMs: number) {
    return this.safe(async () => (await this.r.set(KEYS.lock, turnId, "PX", ttlMs, "NX")) === "OK", true);
  }
  releaseTurnLock(turnId: string) {
    return this.safe(async () => {
      const cur = await this.r.get(KEYS.lock);
      if (cur === turnId) await this.r.del(KEYS.lock);
    }, undefined);
  }
  saveGameState(state: Record<string, unknown> | null) {
    return this.safe(async () => {
      if (state) await this.r.set(KEYS.game, JSON.stringify(state), "EX", 600);
      else await this.r.del(KEYS.game);
    }, undefined);
  }
}

export function createMirror(): StateMirror {
  const url = process.env.REDIS_URL;
  if (!url) return new NoopMirror();
  const r = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
  r.on("error", (e) => console.warn("[redis] error:", e.message));
  console.log("[redis] mirroring queue state to", url.replace(/\/\/.*@/, "//***@"));
  return new RedisMirror(r);
}
