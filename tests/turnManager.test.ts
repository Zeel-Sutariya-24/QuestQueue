import { beforeEach, describe, expect, it } from "vitest";
import { TurnManager, type Turn } from "@/server/queue/TurnManager";
import type { EndReason } from "@/shared/types";

function setup(opts: ConstructorParameters<typeof TurnManager>[1] = {}) {
  let now = 1_000_000;
  const started: Turn[] = [];
  const ended: { turn: Turn; reason: EndReason }[] = [];
  let queueChanges = 0;
  let n = 0;
  const m = new TurnManager(
    {
      onQueueChanged: () => queueChanges++,
      onTurnStarted: (t) => started.push({ ...t }),
      onTurnEnded: (t, reason) => ended.push({ turn: { ...t }, reason }),
    },
    { now: () => now, newId: () => `t${++n}`, ...opts },
  );
  return {
    m,
    started,
    ended,
    advance: (ms: number) => (now += ms),
    changes: () => queueChanges,
  };
}

describe("life rules", () => {
  it("gives 5 lives when more than 5 are waiting, otherwise 10", () => {
    expect(TurnManager.livesFor(0)).toBe(10);
    expect(TurnManager.livesFor(5)).toBe(10);
    expect(TurnManager.livesFor(6)).toBe(5);
    expect(TurnManager.livesFor(40)).toBe(5);
  });

  it("calculates lives at turn start and keeps them fixed", () => {
    const { m } = setup();
    m.join("a", "A"); // starts immediately, 0 waiting -> 10 lives
    for (let i = 0; i < 6; i++) m.join(`w${i}`, `W${i}`);
    expect(m.activeTurn?.maxLives).toBe(10);
    m.leave("w0");
    m.leave("w1");
    expect(m.activeTurn?.maxLives).toBe(10); // unchanged mid-turn
    // next turn begins with 4 waiting -> 10 lives
    m.endTurn("left");
    expect(m.activeTurn?.userId).toBe("w2");
    expect(m.activeTurn?.lives).toBe(10);
  });

  it("gives 5 lives to a player who starts with 6 waiting behind them", () => {
    const { m } = setup();
    m.join("a", "A");
    for (let i = 0; i < 7; i++) m.join(`w${i}`, `W${i}`);
    m.endTurn("left"); // w0 starts with 6 waiting
    expect(m.activeTurn?.userId).toBe("w0");
    expect(m.activeTurn?.lives).toBe(5);
    expect(m.waiting.length).toBe(6);
  });
});

describe("queue", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("first joiner becomes active immediately, others wait in order", () => {
    const { m } = ctx;
    expect(m.join("a", "A")).toEqual({ ok: true, position: 0 });
    expect(m.join("b", "B")).toEqual({ ok: true, position: 1 });
    expect(m.join("c", "C")).toEqual({ ok: true, position: 2 });
    expect(m.activeTurn?.userId).toBe("a");
    expect(m.snapshot().waitingCount).toBe(2);
  });

  it("prevents duplicate entries for the same account", () => {
    const { m } = ctx;
    m.join("a", "A");
    m.join("b", "B");
    expect(m.join("b", "B")).toEqual({ ok: false, error: "already-queued" });
    expect(m.join("a", "A")).toEqual({ ok: false, error: "already-active" });
    expect(m.waiting.length).toBe(1);
  });

  it("leaving updates positions", () => {
    const { m } = ctx;
    m.join("a", "A");
    m.join("b", "B");
    m.join("c", "C");
    m.join("d", "D");
    m.leave("b");
    expect(m.positionOf("c")).toBe(1);
    expect(m.positionOf("d")).toBe(2);
    expect(m.leave("zzz").ok).toBe(false);
  });

  it("only ever has one active player", () => {
    const { m, started } = ctx;
    for (const id of ["a", "b", "c"]) m.join(id, id);
    expect(m.startNextTurn()).toBeNull(); // turn lock: cannot start while active
    expect(started.length).toBe(1);
  });
});

describe("turn transitions", () => {
  it("ends the turn when lives reach zero and activates the next player", () => {
    const { m, ended, started } = setup();
    m.join("a", "A");
    m.join("b", "B");
    const lives = m.activeTurn!.lives;
    for (let i = 0; i < lives - 1; i++) expect(m.loseLife("a")).toBe(lives - 1 - i);
    expect(m.activeTurn?.userId).toBe("a");
    expect(m.loseLife("a")).toBe(0);
    expect(ended[0].reason).toBe("lives-exhausted");
    expect(ended[0].turn.deaths).toBe(lives);
    expect(m.activeTurn?.userId).toBe("b");
    expect(started.map((t) => t.userId)).toEqual(["a", "b"]);
  });

  it("ignores life loss from anyone who is not the active player", () => {
    const { m } = setup();
    m.join("a", "A");
    m.join("b", "B");
    expect(m.loseLife("b")).toBeNull();
    expect(m.activeTurn?.lives).toBe(10);
  });

  it("leaves an idle game when the queue is empty and restarts on join", () => {
    const { m } = setup();
    m.join("a", "A");
    m.loseLife("a");
    m.endTurn("left");
    expect(m.activeTurn).toBeNull();
    m.join("b", "B");
    expect(m.activeTurn?.userId).toBe("b");
  });

  it("transfers control when the active player leaves", () => {
    const { m, ended } = setup();
    m.join("a", "A");
    m.join("b", "B");
    expect(m.leave("a")).toEqual({ ok: true, wasActive: true });
    expect(ended[0].reason).toBe("left");
    expect(m.activeTurn?.userId).toBe("b");
  });
});

describe("disconnects and timers", () => {
  it("does not end the turn during a short disconnect (refresh)", () => {
    const { m, advance } = setup();
    m.join("a", "A");
    m.join("b", "B");
    m.setConnected("a", false);
    advance(5000);
    m.tick();
    expect(m.activeTurn?.userId).toBe("a");
    m.setConnected("a", true);
    advance(60_000);
    m.touchActivity("a");
    m.tick();
    expect(m.activeTurn?.userId).toBe("a");
  });

  it("passes control on when the active player stays disconnected", () => {
    const { m, advance, ended } = setup({ activeGraceMs: 10_000 });
    m.join("a", "A");
    m.join("b", "B");
    m.setConnected("a", false);
    advance(10_500);
    m.tick();
    expect(ended[0].reason).toBe("disconnected");
    expect(m.activeTurn?.userId).toBe("b");
  });

  it("removes waiting players after the grace period and skips disconnected ones", () => {
    const { m, advance } = setup({ waitingGraceMs: 5000 });
    m.join("a", "A");
    m.join("b", "B");
    m.join("c", "C");
    m.setConnected("b", false);
    advance(6000);
    m.tick();
    expect(m.isQueued("b")).toBe(false);
    expect(m.waiting.map((e) => e.userId)).toEqual(["c"]);
  });

  it("skips a disconnected player when their turn would start", () => {
    const { m } = setup({ waitingGraceMs: 999_999 });
    m.join("a", "A");
    m.join("b", "B");
    m.join("c", "C");
    m.setConnected("b", false);
    m.endTurn("left");
    expect(m.activeTurn?.userId).toBe("c");
  });

  it("enforces max turn time and AFK only when others are waiting", () => {
    const { m, advance, ended } = setup({ maxTurnMs: 600_000, afkMs: 20_000 });
    m.join("a", "A");
    advance(120_000);
    m.tick();
    expect(m.activeTurn?.userId).toBe("a"); // nobody waiting: keep playing
    m.join("b", "B");
    m.touchActivity("a");
    advance(25_000);
    m.tick();
    expect(ended[0].reason).toBe("afk");
    expect(m.activeTurn?.userId).toBe("b");
  });
});

describe("estimates", () => {
  it("shows no estimate without history and computes one with history", () => {
    const none = setup();
    none.m.join("a", "A");
    none.m.join("b", "B");
    expect(none.m.snapshot().queue[0].etaMs).toBeNull();

    const withAvg = setup({ avgTurnMs: () => 60_000 });
    withAvg.m.join("a", "A");
    withAvg.m.join("b", "B");
    withAvg.m.join("c", "C");
    withAvg.advance(10_000);
    const snap = withAvg.m.snapshot();
    expect(snap.queue[0].etaMs).toBe(50_000);
    expect(snap.queue[1].etaMs).toBe(110_000);
  });
});
