import { LEVEL_HEIGHT } from "./constants";
import type { LevelData, Rect } from "./types";

export function emptyLevel(width = 60, height = LEVEL_HEIGHT): LevelData {
  return {
    v: 1,
    width,
    height,
    spawn: { x: 2, y: height - 5 },
    exit: { x: width - 4, y: height - 5 },
    solids: [{ x: 0, y: height - 4, w: width, h: 4 }],
    spikes: [],
    pits: [],
    hidden: [],
    movers: [],
    fallers: [],
    fakeDoors: [],
  };
}

/** Trivially valid fallback level. */
export function flatLevel(width = 40): LevelData {
  return emptyLevel(width);
}

export function cloneLevel(level: LevelData): LevelData {
  return JSON.parse(JSON.stringify(level)) as LevelData;
}

/** Split every solid rectangle into 1x1 cells (used by the editor). */
export function expandSolids(solids: Rect[]): Rect[] {
  const seen = new Set<string>();
  const out: Rect[] = [];
  for (const r of solids) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const k = `${x},${y}`;
        if (!seen.has(k)) {
          seen.add(k);
          out.push({ x, y, w: 1, h: 1 });
        }
      }
    }
  }
  return out;
}

/** Merge 1x1 solid cells into horizontal runs. */
export function compactSolids(solids: Rect[]): Rect[] {
  const cells = new Set<string>();
  for (const r of expandSolids(solids)) cells.add(`${r.x},${r.y}`);
  const rows = new Map<number, number[]>();
  for (const k of cells) {
    const [x, y] = k.split(",").map(Number);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y)!.push(x);
  }
  const out: Rect[] = [];
  for (const [y, xs] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b);
    let start = xs[0];
    let prev = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      const x = xs[i];
      if (x !== prev + 1) {
        out.push({ x: start, y, w: prev - start + 1, h: 1 });
        start = x;
      }
      prev = x;
    }
  }
  return out;
}
