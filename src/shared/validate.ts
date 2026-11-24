import { levelSchema } from "./levelSchema";
import { solveLevel, solveLevelAsync } from "./solver";
import type { LevelData } from "./types";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  level?: LevelData;
  frames?: number;
  nodes?: number;
  difficulty?: number;
}

/** Structural checks: bounds, spawn/exit placement, no hazards on spawn... */
export function validateLevelStructure(level: LevelData): string[] {
  const errors: string[] = [];
  const { width, height } = level;
  const inB = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height;
  const solid = new Uint8Array(width * height);

  for (const r of level.solids) {
    if (r.x + r.w > width || r.y + r.h > height) {
      errors.push("A platform extends outside the level boundary.");
      break;
    }
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) solid[y * width + x] = 1;
  }
  const isSolid = (x: number, y: number) => inB(x, y) && solid[y * width + x] === 1;

  const { spawn, exit } = level;
  if (!inB(spawn.x, spawn.y) || spawn.y < 1) errors.push("Spawn point is outside the level.");
  else {
    if (isSolid(spawn.x, spawn.y) || isSolid(spawn.x, spawn.y - 1)) errors.push("Spawn point is inside a wall.");
    if (!isSolid(spawn.x, spawn.y + 1)) errors.push("Spawn point needs solid ground beneath it.");
  }
  if (!inB(exit.x, exit.y) || exit.y < 1) errors.push("Exit door is outside the level.");
  else if (isSolid(exit.x, exit.y) || isSolid(exit.x, exit.y - 1)) errors.push("Exit door is inside a wall.");

  const checkCells = (name: string, cells: { x: number; y: number }[], solidAllowed: boolean) => {
    for (const c of cells) {
      if (!inB(c.x, c.y)) {
        errors.push(`A ${name} is outside the level.`);
        return;
      }
      if (!solidAllowed && isSolid(c.x, c.y)) {
        errors.push(`A ${name} is buried inside a wall.`);
        return;
      }
      if (Math.abs(c.x - spawn.x) <= 2 && Math.abs(c.y - spawn.y) <= 2) {
        errors.push(`A ${name} is too close to the spawn point.`);
        return;
      }
      if (c.x === exit.x && Math.abs(c.y - exit.y) <= 1) {
        errors.push(`A ${name} overlaps the exit door.`);
        return;
      }
    }
  };
  checkCells("spike", level.spikes, false);
  checkCells("hidden trap", level.hidden, false);
  checkCells("pit", level.pits, true);
  for (const d of level.fakeDoors) {
    if (!inB(d.x, d.y) || d.y < 1) {
      errors.push("A fake door is outside the level.");
      break;
    }
    if (d.x === exit.x && d.y === exit.y) {
      errors.push("A fake door overlaps the exit.");
      break;
    }
    if (Math.abs(d.x - spawn.x) <= 2 && Math.abs(d.y - spawn.y) <= 2) {
      errors.push("A fake door is too close to the spawn point.");
      break;
    }
  }
  for (const m of level.movers) {
    const maxX = m.x + (m.axis === "x" ? m.range : 0) + m.w;
    const maxY = m.y + (m.axis === "y" ? m.range : 0);
    if (m.x < 0 || m.y < 0 || maxX > width || maxY >= height) {
      errors.push("A moving platform leaves the level boundary.");
      break;
    }
  }
  for (const f of level.fallers) {
    if (f.x + f.w > width || f.y >= height) {
      errors.push("A falling platform is outside the level.");
      break;
    }
  }
  return errors;
}

export function estimateDifficulty(level: LevelData): number {
  const hazards =
    level.spikes.length +
    level.hidden.length * 2 +
    level.fakeDoors.length * 2 +
    level.movers.length * 2 +
    level.fallers.length * 1.5 +
    level.pits.length / 2.5;
  const density = hazards / Math.max(20, level.width);
  return Math.max(1, Math.min(5, 1 + Math.round(density * 6)));
}

/** Full validation pipeline: schema -> structure -> physics-based solvability proof. */
export function validateLevel(raw: unknown, opts: { maxNodes?: number } = {}): ValidationResult {
  const parsed = levelSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      errors: [`Invalid level data: ${first.path.join(".") || "root"} - ${first.message}`],
    };
  }
  const level = parsed.data as LevelData;
  const errors = validateLevelStructure(level);
  if (errors.length) return { ok: false, errors, level };
  const res = solveLevel(level, { maxNodes: opts.maxNodes ?? 120000 });
  if (!res.solvable) {
    return { ok: false, errors: [res.reason ?? "Level is not completable."], level, nodes: res.nodes };
  }
  return {
    ok: true,
    errors: [],
    level,
    frames: res.frames,
    nodes: res.nodes,
    difficulty: estimateDifficulty(level),
  };
}

/** Async variant used by the server: identical checks, but never blocks the game loop for long. */
export async function validateLevelAsync(raw: unknown, opts: { maxNodes?: number } = {}): Promise<ValidationResult> {
  const parsed = levelSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, errors: [`Invalid level data: ${first.path.join(".") || "root"} - ${first.message}`] };
  }
  const level = parsed.data as LevelData;
  const errors = validateLevelStructure(level);
  if (errors.length) return { ok: false, errors, level };
  const res = await solveLevelAsync(level, { maxNodes: opts.maxNodes ?? 120000 });
  if (!res.solvable) return { ok: false, errors: [res.reason ?? "Level is not completable."], level, nodes: res.nodes };
  return { ok: true, errors: [], level, frames: res.frames, nodes: res.nodes, difficulty: estimateDifficulty(level) };
}
