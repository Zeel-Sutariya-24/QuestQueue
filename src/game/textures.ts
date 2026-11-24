import type Phaser from "phaser";

type Draw = (c: CanvasRenderingContext2D) => void;

function make(w: number, h: number, draw: Draw): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  return c;
}

function sprite(rows: string[], palette: Record<string, string>, scale = 2): HTMLCanvasElement {
  return make(rows[0].length * scale, rows.length * scale, (c) => {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = palette[row[x]];
        if (!col) continue;
        c.fillStyle = col;
        c.fillRect(x * scale, y * scale, scale, scale);
      }
    });
  });
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const PLAYER_PAL = {
  o: "#1a1033",
  b: "#a855f7",
  l: "#e9d5ff",
  s: "#7e22ce",
  y: "#38bdf8",
  w: "#ffffff",
  e: "#0b0d1f",
};
export const PLAYER_TOP = [
  "................",
  "................",
  "....oooooooo....",
  "...obbbbbbbbo...",
  "..obbllbbbbbbo..",
  "..obyyyyyyyybo..",
  "..obywyyywyybo..",
  "..obyeyyyeyybo..",
  "..obyyyyyyyybo..",
  "..obbbbbbbbbbo..",
  "...obbbssbbbo...",
  "...obbbbbbbbo...",
];
export const LEGS: Record<string, string[]> = {
  idle: ["...oossoossoo...", "...osso..osso...", "...oooo..oooo...", "................"],
  run1: ["...oossoossoo...", "..osso....osso..", "..oooo....oooo..", "................"],
  run2: ["....oooooooo....", ".....osssso.....", ".....oooooo.....", "................"],
};

const SPIKE = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  ".......##.......",
  "......#ww#......",
  "...#..#ww#..#...",
  "..#w#.#ww#.#w#..",
  "..#w#.#ww#.#w#..",
  ".#ww##.#ww#.##w#",
  ".#kkkkkkkkkkkkk#",
];

export function generateTextures(scene: Phaser.Scene): void {
  const add = (key: string, canvas: HTMLCanvasElement) => {
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
  };

  // player frames
  for (const [name, legs] of Object.entries(LEGS)) {
    add(`player_${name}`, sprite([...PLAYER_TOP, ...legs], PLAYER_PAL));
  }

  // dirt + grass
  const dirtBase = (c: CanvasRenderingContext2D, seed: number) => {
    const r = rng(seed);
    c.fillStyle = "#2b2050";
    c.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 10; i++) {
      c.fillStyle = r() > 0.5 ? "#3d2f6e" : "#1f1740";
      c.fillRect(Math.floor(r() * 7) * 4, Math.floor(r() * 7) * 4, 4, 4);
    }
    c.fillStyle = "#1f1740";
    c.fillRect(0, 28, 32, 4);
  };
  add("dirt", make(32, 32, (c) => dirtBase(c, 7)));
  add(
    "grass",
    make(32, 32, (c) => {
      dirtBase(c, 11);
      c.fillStyle = "#14b8a6";
      c.fillRect(0, 0, 32, 10);
      c.fillStyle = "#2dd4bf";
      c.fillRect(0, 0, 32, 4);
      c.fillStyle = "#5eead4";
      c.fillRect(0, 0, 32, 2);
      c.fillStyle = "#14b8a6";
      for (const x of [2, 10, 18, 26]) c.fillRect(x, 10, 4, 4);
      c.fillStyle = "#0f766e";
      c.fillRect(0, 8, 32, 2);
    }),
  );

  // platforms
  add(
    "mover",
    make(32, 16, (c) => {
      c.fillStyle = "#1e3a8a";
      c.fillRect(0, 0, 32, 16);
      c.fillStyle = "#3b82f6";
      c.fillRect(0, 0, 32, 6);
      c.fillStyle = "#93c5fd";
      c.fillRect(0, 0, 32, 2);
      c.fillStyle = "#172554";
      c.fillRect(0, 12, 32, 4);
      c.fillStyle = "#a855f7";
      c.fillRect(13, 7, 6, 4);
    }),
  );
  add(
    "faller",
    make(32, 16, (c) => {
      c.fillStyle = "#7c2d12";
      c.fillRect(0, 0, 32, 16);
      c.fillStyle = "#f97316";
      c.fillRect(0, 0, 32, 6);
      c.fillStyle = "#fdba74";
      c.fillRect(0, 0, 32, 2);
      c.fillStyle = "#431407";
      c.fillRect(8, 6, 2, 6);
      c.fillRect(10, 10, 4, 2);
      c.fillRect(22, 6, 2, 8);
      c.fillRect(0, 14, 32, 2);
    }),
  );
  add(
    "solid_block",
    make(32, 32, (c) => {
      c.fillStyle = "#4c3b8a";
      c.fillRect(0, 0, 32, 32);
      c.fillStyle = "#7c6bc4";
      c.fillRect(0, 0, 32, 4);
      c.fillRect(0, 0, 4, 32);
      c.fillStyle = "#2b2050";
      c.fillRect(0, 28, 32, 4);
      c.fillRect(28, 0, 4, 32);
    }),
  );

  // hazards
  add("spike", sprite(SPIKE, { "#": "#94a3b8", w: "#f1f5f9", k: "#334155" }));
  for (let f = 0; f < 2; f++) {
    add(
      `pit${f}`,
      make(32, 32, (c) => {
        c.fillStyle = "#12071f";
        c.fillRect(0, 0, 32, 32);
        c.fillStyle = "#be185d";
        c.fillRect(0, 10, 32, 22);
        c.fillStyle = "#f43f5e";
        for (let x = 0; x < 32; x += 8) c.fillRect(x, 8 + ((x / 8 + f) % 2) * 4, 8, 6);
        c.fillStyle = "#fda4af";
        c.fillRect(4 + f * 12, 14, 4, 4);
        c.fillRect(20 - f * 8, 22, 4, 4);
      }),
    );
  }

  // doors (real exit vs. slightly different fake)
  const door = (fake: boolean) =>
    make(32, 64, (c) => {
      const frame = fake ? "#9a3412" : "#4338ca";
      const hi = fake ? "#fb923c" : "#818cf8";
      const inner = fake ? "#7c2d12" : "#0e7490";
      c.fillStyle = frame;
      c.fillRect(2, 2, 28, 62);
      c.fillStyle = hi;
      c.fillRect(2, 2, 28, 4);
      c.fillRect(2, 2, 4, 62);
      c.fillStyle = inner;
      c.fillRect(8, 10, 16, 54);
      if (!fake) {
        c.fillStyle = "#22d3ee";
        c.fillRect(10, 12, 12, 50);
        c.fillStyle = "#a5f3fc";
        c.fillRect(12, 16, 4, 40);
        c.fillStyle = "#fde047";
        c.fillRect(20, 38, 3, 3);
      } else {
        c.fillStyle = "#c2410c";
        c.fillRect(10, 12, 12, 50);
        c.fillStyle = "#fed7aa";
        c.fillRect(12, 16, 3, 30);
        c.fillStyle = "#fde047";
        c.fillRect(9, 38, 3, 3);
        c.fillStyle = "#431407";
        c.fillRect(17, 20, 2, 10);
        c.fillRect(19, 28, 3, 2);
      }
    });
  add("door", door(false));
  add("fakedoor", door(true));
  add(
    "pad",
    make(32, 8, (c) => {
      c.fillStyle = "#38bdf8";
      c.fillRect(2, 4, 28, 4);
      c.fillStyle = "#e0f2fe";
      c.fillRect(6, 4, 20, 2);
    }),
  );

  // misc
  add("px", make(4, 4, (c) => {
    c.fillStyle = "#fff";
    c.fillRect(0, 0, 4, 4);
  }));
  add(
    "cloud",
    make(96, 32, (c) => {
      c.fillStyle = "rgba(167,139,250,0.28)";
      c.fillRect(8, 16, 80, 12);
      c.fillRect(20, 8, 28, 12);
      c.fillRect(48, 4, 24, 16);
    }),
  );
  add(
    "sky",
    make(4, 540, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 540);
      g.addColorStop(0, "#070815");
      g.addColorStop(0.55, "#1a0f3d");
      g.addColorStop(0.85, "#4c1d95");
      g.addColorStop(1, "#7c3aed");
      c.fillStyle = g;
      c.fillRect(0, 0, 4, 540);
    }),
  );
  add(
    "moon",
    make(64, 64, (c) => {
      c.fillStyle = "#e0e7ff";
      for (let y = -4; y <= 4; y++) {
        const w = Math.round(Math.sqrt(16 - y * y) * 1.0) * 8;
        c.fillRect(32 - w, 32 + y * 8 - 4, w * 2, 8);
      }
      c.fillStyle = "#c7d2fe";
      c.fillRect(24, 20, 8, 8);
      c.fillRect(36, 36, 8, 8);
    }),
  );
  const mountains = (key: string, h: number, color: string, edge: string, seed: number, amp: number) =>
    add(
      key,
      make(512, h, (c) => {
        const r = rng(seed);
        let y = h - amp;
        c.fillStyle = color;
        for (let x = 0; x < 512; x += 16) {
          y += (r() - 0.5) * amp * 0.9;
          y = Math.max(h - amp * 1.4, Math.min(h - 16, y));
          if (x >= 496) y = h - amp; // loop seamlessly
          const yy = Math.round(y / 8) * 8;
          c.fillStyle = color;
          c.fillRect(x, yy, 16, h - yy);
          c.fillStyle = edge;
          c.fillRect(x, yy, 16, 4);
        }
      }),
    );
  mountains("bg_far", 320, "#2e1065", "#5b21b6", 3, 150);
  mountains("bg_near", 220, "#1e1b4b", "#3730a3", 9, 90);
}

export function playerFrame(name: "idle" | "run1" | "run2"): string {
  return `player_${name}`;
}
