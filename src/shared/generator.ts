import { LEVEL_HEIGHT } from "./constants";
import { flatLevel } from "./levelUtils";
import { hashSeed, Rng } from "./rng";
import { solveLevel } from "./solver";
import type { FallerDef, LevelData, MoverDef, Pt, Rect } from "./types";
import { validateLevelStructure } from "./validate";

type Seg = "flat" | "gap" | "spikes" | "step" | "platforms" | "hidden" | "fake" | "mover" | "elevator";

export function difficultyFor(levelNumber: number): number {
  return Math.max(0, Math.min(1, (levelNumber - 1) / 11));
}

/**
 * Deterministic procedural generator. The same (seed, levelNumber) always
 * produces the same level. Segment rules keep every obstacle inside the
 * player's physical capabilities (max jump height ~2.7 tiles, ~4 tiles distance).
 */
export function generateLevel(seed: number, levelNumber: number): LevelData {
  const rng = new Rng(seed);
  const d = difficultyFor(levelNumber);
  const H = LEVEL_HEIGHT;

  const ground: { x: number; len: number; top: number }[] = [];
  const solids: Rect[] = [];
  const spikes: Pt[] = [];
  const pits: Pt[] = [];
  const hidden: Pt[] = [];
  const movers: MoverDef[] = [];
  const fallers: FallerDef[] = [];
  const fakeDoors: Pt[] = [];

  let x = 0;
  let top = 12;
  const flat = (len: number): number => {
    const start = x;
    ground.push({ x, len, top });
    x += len;
    return start;
  };
  const addPits = (from: number, count: number) => {
    for (let i = 0; i < count; i++) pits.push({ x: from + i, y: top + 2 });
  };

  flat(8);
  const spawn = { x: 2, y: top - 1 };
  const target = Math.round(44 + 64 * d);
  let recover = false;

  while (x < target) {
    if (recover) {
      flat(rng.int(3, 4));
      recover = false;
      continue;
    }
    const opts: [Seg, number][] = [
      ["flat", 3 - 2 * d],
      ["gap", 2 + d],
      ["spikes", 1.5 + 2 * d],
      ["step", 1.5],
      ["platforms", 0.5 + 1.5 * d],
    ];
    if (d > 0.15) opts.push(["hidden", 0.5 + 1.5 * d]);
    if (d > 0.25) opts.push(["fake", 0.4 + 0.6 * d]);
    if (d > 0.2) opts.push(["mover", 0.5 + 1.5 * d]);
    if (d > 0.3 && top - 4 >= 5) opts.push(["elevator", 0.9 * d]);
    const seg = rng.weighted(opts);

    switch (seg) {
      case "flat":
        flat(rng.int(3, 5));
        break;
      case "gap": {
        const gw = rng.int(2, d > 0.4 ? 3 : 2);
        addPits(x, gw);
        x += gw;
        recover = true;
        break;
      }
      case "spikes": {
        const n = rng.int(1, 1 + (d > 0.5 ? 2 : d > 0.2 ? 1 : 0));
        const start = flat(n + 5);
        for (let i = 0; i < n; i++) spikes.push({ x: start + 2 + i, y: top - 1 });
        break;
      }
      case "step": {
        const canUp = top > 8;
        const canDown = top < 14;
        const up = canUp && (!canDown || rng.chance(0.5));
        if (up) top -= rng.int(1, d > 0.5 ? 2 : 1);
        else if (canDown) top += rng.int(1, 3);
        top = Math.max(7, Math.min(14, top));
        flat(rng.int(3, 5));
        break;
      }
      case "platforms": {
        const n = rng.int(1, 3);
        const gaps: number[] = [];
        for (let i = 0; i <= n; i++) gaps.push(rng.int(2, 3));
        const gw = gaps.reduce((a, b) => a + b, 0) + 2 * n;
        addPits(x, gw);
        let cx = x;
        for (let i = 0; i < n; i++) {
          cx += gaps[i];
          const raise = gaps[i] === 2 && rng.chance(0.4) ? 1 : 0;
          if (d > 0.3 && rng.chance(0.4 * d + 0.1)) fallers.push({ x: cx, y: top - raise, w: 2 });
          else solids.push({ x: cx, y: top - raise, w: 2, h: 1 });
          cx += 2;
        }
        x += gw;
        recover = true;
        break;
      }
      case "hidden": {
        const len = rng.int(7, 9);
        const start = flat(len);
        hidden.push({ x: start + rng.int(3, len - 4), y: top - 1 });
        break;
      }
      case "fake": {
        const start = flat(8);
        fakeDoors.push({ x: start + 4, y: top - 1 });
        break;
      }
      case "mover": {
        const gw = rng.int(6, 7);
        addPits(x, gw);
        movers.push({ x: x - 1, y: top, w: 3, axis: "x", range: gw - 1, speed: 2 + d });
        x += gw;
        recover = true;
        break;
      }
      case "elevator": {
        flat(3);
        movers.push({ x: x - 2, y: top - 4, w: 2, axis: "y", range: 4, speed: 1.5 });
        top -= 4;
        flat(rng.int(4, 5));
        break;
      }
    }
  }

  const endStart = flat(9);
  const exit = { x: endStart + 5, y: top - 1 };
  for (const g of ground) solids.push({ x: g.x, y: g.top, w: g.len, h: H - g.top });

  return {
    v: 1,
    width: x,
    height: H,
    spawn,
    exit,
    solids,
    spikes,
    pits,
    hidden,
    movers,
    fallers,
    fakeDoors,
  };
}

export interface GeneratedLevel {
  level: LevelData;
  seed: number;
  attempts: number;
  frames: number;
}

/**
 * Generates a level and only returns it once it passed structural validation and
 * the physics solver proved it can be completed. Falls back to a flat level.
 */
export function generateValidatedLevel(levelNumber: number, baseSeed: number): GeneratedLevel {
  for (let attempt = 0; attempt < 8; attempt++) {
    const seed = hashSeed(baseSeed, levelNumber, attempt);
    const level = generateLevel(seed, levelNumber);
    if (validateLevelStructure(level).length) continue;
    const res = solveLevel(level, { maxNodes: 40000 });
    if (res.solvable) return { level, seed, attempts: attempt + 1, frames: res.frames };
  }
  return { level: flatLevel(40), seed: baseSeed, attempts: 8, frames: 600 };
}
