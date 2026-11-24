import { describe, expect, it } from "vitest";
import { generateLevel, generateValidatedLevel } from "@/shared/generator";
import { emptyLevel } from "@/shared/levelUtils";
import { Sim } from "@/shared/sim";
import { solveLevel } from "@/shared/solver";
import { validateLevel, validateLevelStructure } from "@/shared/validate";
import { TILE } from "@/shared/constants";

const none = { left: false, right: false, jump: false };

describe("simulation", () => {
  it("player stands on the ground and walks", () => {
    const sim = new Sim(emptyLevel(40));
    const y0 = sim.p.y;
    for (let i = 0; i < 30; i++) sim.step(none);
    expect(sim.p.y).toBeCloseTo(y0, 1);
    expect(sim.p.grounded).toBe(true);
    const x0 = sim.p.x;
    for (let i = 0; i < 30; i++) sim.step({ ...none, right: true });
    expect(sim.p.x).toBeGreaterThan(x0 + 50);
  });

  it("jumps roughly 2.7 tiles high", () => {
    const sim = new Sim(emptyLevel(40));
    for (let i = 0; i < 5; i++) sim.step(none);
    const y0 = sim.p.y;
    let minY = y0;
    for (let i = 0; i < 60; i++) {
      sim.step({ ...none, jump: true });
      minY = Math.min(minY, sim.p.y);
    }
    const h = (y0 - minY) / TILE;
    expect(h).toBeGreaterThan(2.3);
    expect(h).toBeLessThan(3);
  });

  it("spikes kill and the player respawns", () => {
    const level = emptyLevel(40);
    level.spikes.push({ x: 8, y: level.spawn.y });
    const sim = new Sim(level);
    let died = false;
    for (let i = 0; i < 200 && !died; i++) {
      died = sim.step({ ...none, right: true }).some((e) => e.type === "died");
    }
    expect(died).toBe(true);
    let respawned = false;
    for (let i = 0; i < 100; i++) respawned ||= sim.step(none).some((e) => e.type === "respawned");
    expect(respawned).toBe(true);
  });

  it("falling into a pit is fatal", () => {
    const level = emptyLevel(40);
    level.solids = [{ x: 0, y: 14, w: 6, h: 4 }, { x: 10, y: 14, w: 30, h: 4 }];
    const sim = new Sim(level);
    let cause = "";
    for (let i = 0; i < 300 && !cause; i++) {
      for (const e of sim.step({ ...none, right: true })) if (e.type === "died") cause = e.cause;
    }
    expect(["pit", "fall"]).toContain(cause);
  });

  it("reaching the exit wins", () => {
    const sim = new Sim(emptyLevel(30));
    let won = false;
    for (let i = 0; i < 600 && !won; i++) won = sim.step({ ...none, right: true }).some((e) => e.type === "won");
    expect(won).toBe(true);
  });
});

describe("validation", () => {
  it("rejects unknown keys and unreachable exits", () => {
    const bad = { ...emptyLevel(40), evil: "alert(1)" };
    expect(validateLevel(bad).ok).toBe(false);
    const walled = emptyLevel(40);
    walled.solids.push({ x: 20, y: 0, w: 2, h: 18 });
    const res = validateLevel(walled, { maxNodes: 3000 });
    expect(res.ok).toBe(false);
  });

  it("rejects spawn inside walls", () => {
    const l = emptyLevel(40);
    l.spawn = { x: 2, y: 15 };
    expect(validateLevelStructure(l).length).toBeGreaterThan(0);
  });

  it("accepts a simple valid level", () => {
    expect(validateLevel(emptyLevel(40)).ok).toBe(true);
  });
});

describe("procedural generation", () => {
  it("is deterministic", () => {
    expect(generateLevel(123, 5)).toEqual(generateLevel(123, 5));
  });

  it("produces solvable levels with valid structure across difficulties", () => {
    for (let n = 1; n <= 14; n++) {
      for (const seed of [1, 2, 3]) {
        const level = generateLevel(seed * 7919 + n, n);
        expect(validateLevelStructure(level)).toEqual([]);
        const res = solveLevel(level, { maxNodes: 60000 });
        if (!res.solvable) console.log("unsolved", { n, seed, nodes: res.nodes });
        expect(res.solvable).toBe(true);
      }
    }
  });

  it("generateValidatedLevel never returns an unsolved level", () => {
    const g = generateValidatedLevel(9, 42);
    expect(solveLevel(g.level).solvable).toBe(true);
  });
});
