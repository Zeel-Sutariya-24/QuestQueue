import {
  DEATH_DELAY,
  DT,
  FALLER_DELAY,
  GRAVITY,
  HIDDEN_TRIGGER,
  JUMP_V,
  MAX_FALL,
  MOVE_SPEED,
  PLATFORM_H,
  PLAYER_H,
  PLAYER_W,
  TILE,
} from "./constants";
import type { DeathCause, InputState, LevelData, NetState, SimEvent } from "./types";

interface PlayerState {
  x: number; // center x (px)
  y: number; // feet y (px)
  vx: number;
  vy: number;
  grounded: boolean;
  riding: number;
  coyote: number;
  jumpBuf: number;
  facing: 1 | -1;
  status: 0 | 1 | 2; // alive | dead | won
  deathTimer: number;
  prevJump: boolean;
}

interface FallerState {
  timer: number;
  falling: boolean;
  y: number;
  vy: number;
  gone: boolean;
}

export interface SimSnapshot {
  tick: number;
  p: PlayerState;
  fallers: FallerState[];
  hidden: boolean[];
  px: number[];
  py: number[];
}

const EPS = 0.001;
const HW = PLAYER_W / 2;

/**
 * Deterministic fixed-step platformer simulation (60 Hz).
 * The server runs this as the single source of truth; the browser only uses it
 * for local practice / editor test mode and for level validation.
 */
export class Sim {
  readonly level: LevelData;
  tick = 0;
  p!: PlayerState;
  fallers: FallerState[] = [];
  hidden: boolean[] = [];
  px: number[] = [];
  py: number[] = [];
  private prevPx: number[] = [];
  private prevPy: number[] = [];
  private pw: number[] = [];
  private solid: Uint8Array;
  private spikeAt = new Map<number, number>();
  private pitAt = new Set<number>();
  private hiddenAt = new Map<number, number>();
  private moverCount: number;

  constructor(level: LevelData) {
    this.level = level;
    const { width, height } = level;
    this.solid = new Uint8Array(width * height);
    for (const r of level.solids) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (x >= 0 && x < width && y >= 0 && y < height) this.solid[y * width + x] = 1;
        }
      }
    }
    level.spikes.forEach((s, i) => this.spikeAt.set(s.y * width + s.x, i));
    level.pits.forEach((s) => this.pitAt.add(s.y * width + s.x));
    level.hidden.forEach((s, i) => this.hiddenAt.set(s.y * width + s.x, i));
    this.moverCount = level.movers.length;
    this.pw = [
      ...level.movers.map((m) => m.w * TILE),
      ...level.fallers.map((f) => f.w * TILE),
    ];
    this.reset();
  }

  get platformCount(): number {
    return this.pw.length;
  }

  /** Reset dynamic state and put the player on the spawn point. */
  reset(): void {
    const { spawn } = this.level;
    this.tick = 0;
    this.fallers = this.level.fallers.map((f) => ({
      timer: 0,
      falling: false,
      y: f.y * TILE,
      vy: 0,
      gone: false,
    }));
    this.hidden = this.level.hidden.map(() => false);
    this.px = new Array(this.pw.length).fill(0);
    this.py = new Array(this.pw.length).fill(0);
    this.updatePlatforms();
    this.prevPx = this.px.slice();
    this.prevPy = this.py.slice();
    this.p = {
      x: spawn.x * TILE + TILE / 2,
      y: (spawn.y + 1) * TILE,
      vx: 0,
      vy: 0,
      grounded: true,
      riding: -1,
      coyote: 0.08,
      jumpBuf: 0,
      facing: 1,
      status: 0,
      deathTimer: 0,
      prevJump: false,
    };
  }

  snapshot(): SimSnapshot {
    return {
      tick: this.tick,
      p: { ...this.p },
      fallers: this.fallers.map((f) => ({ ...f })),
      hidden: this.hidden.slice(),
      px: this.px.slice(),
      py: this.py.slice(),
    };
  }

  restore(s: SimSnapshot): void {
    this.tick = s.tick;
    this.p = { ...s.p };
    for (let i = 0; i < s.fallers.length; i++) Object.assign(this.fallers[i], s.fallers[i]);
    for (let i = 0; i < s.hidden.length; i++) this.hidden[i] = s.hidden[i];
    for (let i = 0; i < s.px.length; i++) {
      this.px[i] = s.px[i];
      this.py[i] = s.py[i];
    }
  }

  private isSolid(cx: number, cy: number): boolean {
    const { width, height } = this.level;
    if (cx < 0 || cx >= width) return true;
    if (cy < 0 || cy >= height) return false;
    return this.solid[cy * width + cx] === 1;
  }

  private moverOffset(i: number): number {
    const m = this.level.movers[i];
    if (m.range <= 0) return 0;
    const s = (m.speed * this.tick * DT) % (2 * m.range);
    return s < m.range ? s : 2 * m.range - s;
  }

  private updatePlatforms(): void {
    const { movers, fallers } = this.level;
    for (let i = 0; i < movers.length; i++) {
      const m = movers[i];
      const off = this.moverOffset(i);
      this.px[i] = (m.x + (m.axis === "x" ? off : 0)) * TILE;
      this.py[i] = (m.y + (m.axis === "y" ? off : 0)) * TILE;
    }
    for (let j = 0; j < fallers.length; j++) {
      const f = this.fallers[j];
      if (f.falling && !f.gone) {
        f.vy = Math.min(f.vy + GRAVITY * DT, MAX_FALL);
        f.y += f.vy * DT;
        if (f.y > (this.level.height + 6) * TILE) f.gone = true;
      }
      this.px[this.moverCount + j] = fallers[j].x * TILE;
      this.py[this.moverCount + j] = f.y;
    }
  }

  private platformSolid(i: number): boolean {
    if (i < this.moverCount) return true;
    const f = this.fallers[i - this.moverCount];
    return !f.falling && !f.gone;
  }

  step(input: InputState): SimEvent[] {
    const ev: SimEvent[] = [];
    const p = this.p;
    const lvl = this.level;
    for (let i = 0; i < this.px.length; i++) {
      this.prevPx[i] = this.px[i];
      this.prevPy[i] = this.py[i];
    }
    this.tick++;
    this.updatePlatforms();

    if (p.status === 1) {
      p.deathTimer -= DT;
      if (p.deathTimer <= 0) {
        this.reset();
        ev.push({ type: "respawned" });
      }
      return ev;
    }
    if (p.status === 2) return ev;

    // carry by platform
    let carryDx = 0;
    if (p.riding >= 0) {
      if (this.platformSolid(p.riding)) {
        carryDx = this.px[p.riding] - this.prevPx[p.riding];
        p.y += this.py[p.riding] - this.prevPy[p.riding];
      } else {
        p.riding = -1;
      }
    }

    // horizontal intent
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const accel = p.grounded ? 3200 : 2400;
    const target = dir * MOVE_SPEED;
    if (p.vx < target) p.vx = Math.min(target, p.vx + accel * DT);
    else if (p.vx > target) p.vx = Math.max(target, p.vx - accel * DT);
    if (dir !== 0) p.facing = dir as 1 | -1;

    // jump (buffer + coyote time)
    if (input.jump && !p.prevJump) p.jumpBuf = 0.1;
    else p.jumpBuf = Math.max(0, p.jumpBuf - DT);
    p.prevJump = input.jump;
    p.coyote = p.grounded ? 0.08 : Math.max(0, p.coyote - DT);
    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.vy = -JUMP_V;
      p.jumpBuf = 0;
      p.coyote = 0;
      p.grounded = false;
      p.riding = -1;
    }
    if (!input.jump && p.vy < -JUMP_V * 0.5) p.vy = -JUMP_V * 0.5;
    p.vy = Math.min(p.vy + GRAVITY * DT, MAX_FALL);

    // move X
    const dx = p.vx * DT + carryDx;
    p.x += dx;
    this.collideX(dx);

    // move Y
    const feetBefore = p.y;
    p.y += p.vy * DT;
    p.grounded = false;
    let ridingNow = -1;
    const l = Math.floor((p.x - HW + EPS) / TILE);
    const r = Math.floor((p.x + HW - EPS) / TILE);
    if (p.vy >= 0) {
      const row = Math.floor((p.y - EPS) / TILE);
      let hit = false;
      for (let c = l; c <= r && !hit; c++) if (this.isSolid(c, row)) hit = true;
      if (hit && feetBefore <= row * TILE + 0.01) {
        p.y = row * TILE;
        p.vy = 0;
        p.grounded = true;
      }
      for (let i = 0; i < this.px.length; i++) {
        if (!this.platformSolid(i)) continue;
        if (p.x + HW <= this.px[i] || p.x - HW >= this.px[i] + this.pw[i]) continue;
        const top = this.py[i];
        if (p.y >= top && feetBefore <= Math.max(this.prevPy[i], top) + 4) {
          if (p.grounded && p.y <= top + 0.01) continue; // prefer solid ground when coplanar
          p.y = top;
          p.vy = 0;
          p.grounded = true;
          ridingNow = i;
        }
      }
    } else {
      const tRow = Math.floor((p.y - PLAYER_H) / TILE);
      let hit = false;
      for (let c = l; c <= r && !hit; c++) if (this.isSolid(c, tRow)) hit = true;
      if (hit) {
        p.y = (tRow + 1) * TILE + PLAYER_H;
        p.vy = 0;
      }
    }
    p.riding = ridingNow;
    if (ridingNow >= this.moverCount) {
      const f = this.fallers[ridingNow - this.moverCount];
      f.timer += DT;
      if (f.timer >= FALLER_DELAY) {
        f.falling = true;
        p.riding = -1;
        p.grounded = false;
      }
    }

    // hidden trap triggers
    for (let i = 0; i < lvl.hidden.length; i++) {
      if (this.hidden[i]) continue;
      const h = lvl.hidden[i];
      if (
        Math.abs(p.x - (h.x + 0.5) * TILE) < HIDDEN_TRIGGER &&
        p.y > h.y * TILE - 3 * TILE &&
        p.y < (h.y + 3) * TILE
      ) {
        this.hidden[i] = true;
      }
    }

    // hazards
    const cause = this.checkHazards();
    if (cause) {
      this.kill(cause, ev);
      return ev;
    }
    if (p.y - PLAYER_H > (lvl.height + 1) * TILE) {
      this.kill("fall", ev);
      return ev;
    }

    // exit door
    const ex = lvl.exit;
    const dl = ex.x * TILE + 6;
    const dr = ex.x * TILE + TILE - 6;
    const dt = (ex.y - 1) * TILE + 4;
    const db = (ex.y + 1) * TILE;
    if (p.x + 6 > dl && p.x - 6 < dr && p.y > dt && p.y - 20 < db) {
      p.status = 2;
      p.vx = 0;
      p.vy = 0;
      ev.push({ type: "won" });
    }
    return ev;
  }

  private kill(cause: DeathCause, ev: SimEvent[]): void {
    const p = this.p;
    p.status = 1;
    p.deathTimer = DEATH_DELAY;
    p.vx = 0;
    p.vy = 0;
    p.riding = -1;
    ev.push({ type: "died", cause });
  }

  private collideX(dx: number): void {
    const p = this.p;
    if (dx === 0) return;
    const l = Math.floor((p.x - HW + EPS) / TILE);
    const r = Math.floor((p.x + HW - EPS) / TILE);
    const t = Math.floor((p.y - PLAYER_H + EPS) / TILE);
    const b = Math.floor((p.y - EPS) / TILE);
    let best: number | null = null;
    for (let row = t; row <= b; row++) {
      for (let c = l; c <= r; c++) {
        if (!this.isSolid(c, row)) continue;
        if (dx > 0) best = best === null ? c : Math.min(best, c);
        else best = best === null ? c : Math.max(best, c);
      }
    }
    if (best !== null) {
      p.x = dx > 0 ? best * TILE - HW : (best + 1) * TILE + HW;
      p.vx = 0;
    }
  }

  private checkHazards(): DeathCause | null {
    const p = this.p;
    const w = this.level.width;
    const left = p.x - 8;
    const right = p.x + 8;
    const top = p.y - 26;
    const bottom = p.y - 2;
    const c0 = Math.floor(left / TILE);
    const c1 = Math.floor(right / TILE);
    const r0 = Math.floor(top / TILE);
    const r1 = Math.floor(bottom / TILE);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        if (cx < 0 || cx >= w || cy < 0) continue;
        const key = cy * w + cx;
        if (this.pitAt.has(key)) return "pit";
        if (this.spikeAt.has(key)) {
          const sx = cx * TILE + 6;
          const sy = cy * TILE + 14;
          if (right > sx && left < sx + 20 && bottom > sy && top < sy + 18) return "spike";
        }
        const hi = this.hiddenAt.get(key);
        if (hi !== undefined && this.hidden[hi]) {
          const sx = cx * TILE + 6;
          const sy = cy * TILE + 14;
          if (right > sx && left < sx + 20 && bottom > sy && top < sy + 18) return "hidden-trap";
        }
      }
    }
    for (const d of this.level.fakeDoors) {
      const dl = d.x * TILE + 4;
      const dr = d.x * TILE + TILE - 4;
      const dt = (d.y - 1) * TILE + 8;
      const db = (d.y + 1) * TILE;
      if (right > dl && left < dr && bottom > dt && top < db) return "fake-door";
    }
    return null;
  }

  netState(): NetState {
    const p = this.p;
    const pl: number[] = [];
    for (let i = 0; i < this.px.length; i++) {
      pl.push(Math.round(this.px[i] * 10) / 10, Math.round(this.py[i] * 10) / 10);
    }
    const hd: number[] = [];
    this.hidden.forEach((v, i) => v && hd.push(i));
    return {
      tk: this.tick,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      vx: Math.round(p.vx),
      vy: Math.round(p.vy),
      f: p.facing,
      st: p.status,
      g: p.grounded ? 1 : 0,
      pl,
      hd,
      ft: this.fallers.map((f) => Math.round(f.timer * 100) / 100),
    };
  }
}

export const PLATFORM_THICKNESS = PLATFORM_H;
