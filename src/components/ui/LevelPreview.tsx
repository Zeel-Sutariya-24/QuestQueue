"use client";

import { useEffect, useRef } from "react";
import type { LevelData } from "@/shared/types";

/** Draws a miniature top-down picture of a level on a canvas. */
export default function LevelPreview({
  level,
  scale = 4,
  className = "",
}: {
  level: LevelData;
  scale?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const s = scale;
    c.width = level.width * s;
    c.height = level.height * s;
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#0b0d1f");
    g.addColorStop(1, "#2e1065");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    const solid = new Set<string>();
    for (const r of level.solids)
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) solid.add(`${x},${y}`);
    for (const k of solid) {
      const [x, y] = k.split(",").map(Number);
      ctx.fillStyle = solid.has(`${x},${y - 1}`) ? "#3d2f6e" : "#2dd4bf";
      ctx.fillRect(x * s, y * s, s, s);
    }
    ctx.fillStyle = "#f43f5e";
    for (const p of level.pits) ctx.fillRect(p.x * s, p.y * s, s, s);
    ctx.fillStyle = "#e2e8f0";
    for (const p of level.spikes) ctx.fillRect(p.x * s, p.y * s + s / 2, s, s / 2);
    ctx.fillStyle = "#3b82f6";
    for (const m of level.movers) {
      ctx.fillRect(m.x * s, m.y * s, m.w * s, Math.max(1, s / 2));
      ctx.globalAlpha = 0.25;
      if (m.axis === "x") ctx.fillRect(m.x * s, m.y * s, (m.w + m.range) * s, Math.max(1, s / 2));
      else ctx.fillRect(m.x * s, m.y * s, m.w * s, (m.range + 0.5) * s);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "#f97316";
    for (const f of level.fallers) ctx.fillRect(f.x * s, f.y * s, f.w * s, Math.max(1, s / 2));
    ctx.fillStyle = "#fb923c";
    for (const d of level.fakeDoors) ctx.fillRect(d.x * s, (d.y - 1) * s, s, s * 2);
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(level.exit.x * s, (level.exit.y - 1) * s, s, s * 2);
    ctx.fillStyle = "#a855f7";
    ctx.fillRect(level.spawn.x * s, (level.spawn.y - 1) * s, s, s * 2);
  }, [level, scale]);
  return <canvas ref={ref} className={`block w-full rounded-lg border-2 border-line ${className}`} />;
}
