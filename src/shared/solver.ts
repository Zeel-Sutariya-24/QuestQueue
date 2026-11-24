import { TILE } from "./constants";
import { Sim, type SimSnapshot } from "./sim";
import type { InputState, LevelData } from "./types";

export interface SolveResult {
  solvable: boolean;
  nodes: number;
  frames: number;
  reason?: string;
}

interface Node {
  f: number;
  snap: SimSnapshot;
  frames: number;
}

class MinHeap {
  private a: Node[] = [];
  get size() {
    return this.a.length;
  }
  push(n: Node) {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): Node | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const ACTIONS: InputState[] = [];
for (const dir of [1, 0, -1]) {
  for (const jump of [false, true]) {
    ACTIONS.push({ left: dir < 0, right: dir > 0, jump });
  }
}

/**
 * Proves a level is completable by searching for an input sequence with the REAL
 * game physics (best-first search over macro actions). A "true" result is a
 * guarantee; a "false" result means no solution was found within the node budget.
 */
export interface SolveOptions {
  maxNodes?: number;
  macroFrames?: number;
  maxFrames?: number;
}

export function solveLevel(level: LevelData, opts: SolveOptions = {}): SolveResult {
  const gen = solveSteps(level, opts);
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
  }
}

/** Same search, but yields to the event loop regularly so the live game never stalls. */
export async function solveLevelAsync(level: LevelData, opts: SolveOptions = {}): Promise<SolveResult> {
  const gen = solveSteps(level, opts);
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

function* solveSteps(level: LevelData, opts: SolveOptions): Generator<void, SolveResult, void> {
  const maxNodes = opts.maxNodes ?? 60000;
  const macro = opts.macroFrames ?? 8;
  const maxFrames = opts.maxFrames ?? 5400;
  const sim = new Sim(level);
  const timed = level.movers.length > 0 || level.fallers.length > 0;
  const ex = (level.exit.x + 0.5) * TILE;
  const ey = level.exit.y * TILE;
  const heap = new MinHeap();
  const seen = new Set<string>();

  const keyOf = (): string => {
    const p = sim.p;
    let k =
      Math.round(p.x / 4) +
      "," +
      Math.round(p.y / 4) +
      "," +
      Math.round(p.vx / 60) +
      "," +
      Math.round(p.vy / 70) +
      "," +
      (p.grounded ? 1 : 0) +
      (p.prevJump ? 1 : 0);
    if (timed) k += "," + ((sim.tick >> 3) % 150);
    for (const f of sim.fallers) k += f.falling ? "f" : f.timer > 0 ? "t" : "s";
    for (const h of sim.hidden) k += h ? "1" : "0";
    return k;
  };
  const heur = (frames: number): number => {
    const p = sim.p;
    return (Math.abs(p.x - ex) + 0.8 * Math.abs(p.y - ey)) / 3.3 + frames * 0.08;
  };

  const startSnap = sim.snapshot();
  seen.add(keyOf());
  heap.push({ f: heur(0), snap: startSnap, frames: 0 });
  let nodes = 0;

  while (heap.size > 0 && nodes < maxNodes) {
    const node = heap.pop()!;
    nodes++;
    if (nodes % 1500 === 0) yield;
    for (const action of ACTIONS) {
      sim.restore(node.snap);
      let dead = false;
      let won = false;
      for (let k = 0; k < macro; k++) {
        sim.step(action);
        const st = sim.p.status;
        if (st === 2) {
          won = true;
          break;
        }
        if (st === 1) {
          dead = true;
          break;
        }
      }
      if (won) return { solvable: true, nodes, frames: node.frames + macro };
      if (dead) continue;
      const frames = node.frames + macro;
      if (frames > maxFrames) continue;
      const key = keyOf();
      if (seen.has(key)) continue;
      seen.add(key);
      heap.push({ f: heur(frames), snap: sim.snapshot(), frames });
    }
  }
  return {
    solvable: false,
    nodes,
    frames: 0,
    reason:
      heap.size === 0
        ? "No route to the exit exists with the available jumps."
        : "Could not find a route to the exit within the search budget.",
  };
}
