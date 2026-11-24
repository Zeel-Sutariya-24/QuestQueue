import { LEVEL_HEIGHT, MAX_LEVEL_W, MIN_LEVEL_W } from "@/shared/constants";
import { cloneLevel, compactSolids, emptyLevel, expandSolids } from "@/shared/levelUtils";
import type { LevelData } from "@/shared/types";

export type Tool =
  | "solid"
  | "spike"
  | "pit"
  | "hidden"
  | "mover"
  | "faller"
  | "fake"
  | "spawn"
  | "exit"
  | "erase";

export interface ToolOptions {
  moverW: number;
  moverAxis: "x" | "y";
  moverRange: number;
  moverSpeed: number;
  fallerW: number;
}

export const DEFAULT_OPTIONS: ToolOptions = { moverW: 3, moverAxis: "x", moverRange: 5, moverSpeed: 2, fallerW: 2 };

/** Editor works on 1x1 solid cells; they are merged back into rects on export. */
export function newEditorLevel(width = 60): LevelData {
  const l = emptyLevel(width, LEVEL_HEIGHT);
  l.solids = expandSolids(l.solids);
  return l;
}

export function toEditorLevel(level: LevelData): LevelData {
  const l = cloneLevel(level);
  l.solids = expandSolids(l.solids);
  return l;
}

export function exportLevel(level: LevelData): LevelData {
  const l = cloneLevel(level);
  l.solids = compactSolids(l.solids);
  return l;
}

const inBounds = (l: LevelData, x: number, y: number) => x >= 0 && y >= 0 && x < l.width && y < l.height;

export function removeAt(l: LevelData, x: number, y: number): void {
  l.solids = l.solids.filter((s) => !(s.x === x && s.y === y));
  l.spikes = l.spikes.filter((s) => !(s.x === x && s.y === y));
  l.pits = l.pits.filter((s) => !(s.x === x && s.y === y));
  l.hidden = l.hidden.filter((s) => !(s.x === x && s.y === y));
  l.movers = l.movers.filter((m) => !(m.y === y && x >= m.x && x < m.x + m.w));
  l.fallers = l.fallers.filter((f) => !(f.y === y && x >= f.x && x < f.x + f.w));
  l.fakeDoors = l.fakeDoors.filter((d) => !(d.x === x && (d.y === y || d.y - 1 === y)));
}

/** Applies a tool at a cell. Returns true when the level changed. */
export function applyTool(l: LevelData, tool: Tool, x: number, y: number, o: ToolOptions): boolean {
  if (!inBounds(l, x, y)) return false;
  const before = JSON.stringify(l);
  switch (tool) {
    case "erase":
      removeAt(l, x, y);
      break;
    case "solid":
      removeAt(l, x, y);
      l.solids.push({ x, y, w: 1, h: 1 });
      break;
    case "spike":
      removeAt(l, x, y);
      l.spikes.push({ x, y });
      break;
    case "pit":
      removeAt(l, x, y);
      l.pits.push({ x, y });
      break;
    case "hidden":
      removeAt(l, x, y);
      l.hidden.push({ x, y });
      break;
    case "mover": {
      const span = o.moverAxis === "x" ? o.moverRange : 0;
      const mx = Math.max(0, Math.min(l.width - o.moverW - span, x));
      const my = Math.max(0, Math.min(l.height - 1 - (o.moverAxis === "y" ? o.moverRange : 0), y));
      removeAt(l, mx, my);
      l.movers.push({ x: mx, y: my, w: o.moverW, axis: o.moverAxis, range: o.moverRange, speed: o.moverSpeed });
      break;
    }
    case "faller": {
      const fx = Math.max(0, Math.min(l.width - o.fallerW, x));
      removeAt(l, fx, y);
      l.fallers.push({ x: fx, y, w: o.fallerW });
      break;
    }
    case "fake":
      if (y < 1) return false;
      removeAt(l, x, y);
      l.fakeDoors.push({ x, y });
      break;
    case "spawn":
      if (y < 1) return false;
      l.spawn = { x, y };
      break;
    case "exit":
      if (y < 1) return false;
      l.exit = { x, y };
      break;
  }
  return JSON.stringify(l) !== before;
}

export function resizeLevel(l: LevelData, width: number): LevelData {
  const w = Math.max(MIN_LEVEL_W, Math.min(MAX_LEVEL_W, Math.round(width)));
  const n = cloneLevel(l);
  n.width = w;
  n.solids = n.solids.filter((s) => s.x < w);
  n.spikes = n.spikes.filter((s) => s.x < w);
  n.pits = n.pits.filter((s) => s.x < w);
  n.hidden = n.hidden.filter((s) => s.x < w);
  n.movers = n.movers.filter((m) => m.x + m.w + (m.axis === "x" ? m.range : 0) <= w);
  n.fallers = n.fallers.filter((f) => f.x + f.w <= w);
  n.fakeDoors = n.fakeDoors.filter((s) => s.x < w);
  // widening a flat map: extend the ground row(s) under the new area
  if (w > l.width) {
    const ground = new Set(l.solids.filter((s) => s.x === l.width - 1).map((s) => s.y));
    for (const y of ground) for (let x = l.width; x < w; x++) n.solids.push({ x, y, w: 1, h: 1 });
  }
  n.spawn = { x: Math.min(n.spawn.x, w - 1), y: n.spawn.y };
  n.exit = { x: Math.min(n.exit.x, w - 1), y: n.exit.y };
  return n;
}
