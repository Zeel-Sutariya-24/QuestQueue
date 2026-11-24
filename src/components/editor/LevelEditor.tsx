"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useGame } from "@/lib/socket";
import { cloneLevel } from "@/shared/levelUtils";
import type { LevelData } from "@/shared/types";
import { validateLevel, validateLevelStructure, type ValidationResult } from "@/shared/validate";
import LocalPlay from "@/components/game/LocalPlay";
import {
  applyTool,
  DEFAULT_OPTIONS,
  exportLevel,
  newEditorLevel,
  resizeLevel,
  toEditorLevel,
  type Tool,
  type ToolOptions,
} from "./editorOps";

const CS = 24;
const DRAFT_KEY = "pq_editor_draft_v1";

const TOOLS: { id: Tool; label: string; color: string; hint: string }[] = [
  { id: "solid", label: "Platform", color: "#2dd4bf", hint: "Solid blocks. Click or drag to paint." },
  { id: "spike", label: "Spike", color: "#e2e8f0", hint: "Deadly spikes on top of a block." },
  { id: "pit", label: "Pit", color: "#f43f5e", hint: "Deadly pit / lava tile." },
  { id: "hidden", label: "Hidden trap", color: "#a855f7", hint: "Invisible spike that pops up when a player nears it." },
  { id: "mover", label: "Moving platform", color: "#3b82f6", hint: "Oscillating platform. Set size, direction and range below." },
  { id: "faller", label: "Falling platform", color: "#f97316", hint: "Drops shortly after being stood on." },
  { id: "fake", label: "Fake door", color: "#fb923c", hint: "Looks like an exit but kills the player." },
  { id: "spawn", label: "Spawn", color: "#c084fc", hint: "Where the player starts. Click to move it." },
  { id: "exit", label: "Exit door", color: "#22d3ee", hint: "The real exit door. Click to move it." },
  { id: "erase", label: "Eraser", color: "#94a3b8", hint: "Remove anything in a cell. Right-click also erases." },
];

function draw(ctx: CanvasRenderingContext2D, l: LevelData, hover: { x: number; y: number } | null, tool: Tool, o: ToolOptions) {
  const W = l.width * CS;
  const H = l.height * CS;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b0d1f");
  g.addColorStop(1, "#24104d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(124,107,196,0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= l.width; x++) {
    ctx.moveTo(x * CS + 0.5, 0);
    ctx.lineTo(x * CS + 0.5, H);
  }
  for (let y = 0; y <= l.height; y++) {
    ctx.moveTo(0, y * CS + 0.5);
    ctx.lineTo(W, y * CS + 0.5);
  }
  ctx.stroke();
  // ruler
  ctx.fillStyle = "rgba(148,163,184,0.5)";
  ctx.font = "10px monospace";
  for (let x = 0; x < l.width; x += 5) ctx.fillText(String(x), x * CS + 3, 10);

  const solid = new Set(l.solids.map((s) => `${s.x},${s.y}`));
  for (const s of l.solids) {
    const top = !solid.has(`${s.x},${s.y - 1}`);
    ctx.fillStyle = top ? "#2dd4bf" : "#3d2f6e";
    ctx.fillRect(s.x * CS, s.y * CS, CS, CS);
    ctx.fillStyle = top ? "#5eead4" : "#4c3b8a";
    ctx.fillRect(s.x * CS, s.y * CS, CS, 3);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(s.x * CS, s.y * CS + CS - 2, CS, 2);
  }
  for (const p of l.pits) {
    ctx.fillStyle = "#be185d";
    ctx.fillRect(p.x * CS, p.y * CS, CS, CS);
    ctx.fillStyle = "#f43f5e";
    ctx.fillRect(p.x * CS, p.y * CS, CS, 6);
  }
  const spike = (x: number, y: number, color: string, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x * CS + i * (CS / 2), (y + 1) * CS);
      ctx.lineTo(x * CS + i * (CS / 2) + CS / 4, y * CS + 6);
      ctx.lineTo(x * CS + (i + 1) * (CS / 2), (y + 1) * CS);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  for (const s of l.spikes) spike(s.x, s.y, "#e2e8f0");
  for (const s of l.hidden) {
    spike(s.x, s.y, "#c084fc", 0.55);
    ctx.strokeStyle = "#a855f7";
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(s.x * CS + 1.5, s.y * CS + 1.5, CS - 3, CS - 3);
    ctx.setLineDash([]);
    ctx.fillStyle = "#e9d5ff";
    ctx.fillText("?", s.x * CS + 8, s.y * CS + 14);
  }
  for (const m of l.movers) {
    ctx.fillStyle = "rgba(59,130,246,0.18)";
    if (m.axis === "x") ctx.fillRect(m.x * CS, m.y * CS, (m.w + m.range) * CS, 8);
    else ctx.fillRect(m.x * CS, m.y * CS, m.w * CS, (m.range + 0.35) * CS);
    ctx.fillStyle = "#3b82f6";
    ctx.fillRect(m.x * CS, m.y * CS, m.w * CS, 8);
    ctx.fillStyle = "#93c5fd";
    ctx.fillRect(m.x * CS, m.y * CS, m.w * CS, 2);
    ctx.fillStyle = "#fff";
    ctx.fillText(m.axis === "x" ? "↔" : "↕", m.x * CS + (m.w * CS) / 2 - 4, m.y * CS + 18);
  }
  for (const f of l.fallers) {
    ctx.fillStyle = "#f97316";
    ctx.fillRect(f.x * CS, f.y * CS, f.w * CS, 8);
    ctx.fillStyle = "#7c2d12";
    for (let i = 0; i < f.w * 2; i++) ctx.fillRect(f.x * CS + i * (CS / 2) + 4, f.y * CS + 2, 2, 5);
  }
  const door = (x: number, y: number, c1: string, c2: string, label: string) => {
    ctx.fillStyle = c1;
    ctx.fillRect(x * CS + 3, (y - 1) * CS + 2, CS - 6, CS * 2 - 2);
    ctx.fillStyle = c2;
    ctx.fillRect(x * CS + 6, (y - 1) * CS + 6, CS - 12, CS * 2 - 8);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px monospace";
    ctx.fillText(label, x * CS + 8, y * CS + 4);
    ctx.font = "10px monospace";
  };
  for (const d of l.fakeDoors) door(d.x, d.y, "#9a3412", "#c2410c", "?");
  door(l.exit.x, l.exit.y, "#4338ca", "#22d3ee", "E");
  door(l.spawn.x, l.spawn.y, "#7e22ce", "#c084fc", "S");

  if (hover) {
    const t = TOOLS.find((x) => x.id === tool)!;
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 2;
    let w = 1;
    if (tool === "mover") w = o.moverW;
    if (tool === "faller") w = o.fallerW;
    const h = tool === "spawn" || tool === "exit" || tool === "fake" ? 2 : 1;
    const y0 = h === 2 ? hover.y - 1 : hover.y;
    ctx.strokeRect(hover.x * CS + 1, y0 * CS + 1, w * CS - 2, h * CS - 2);
    ctx.lineWidth = 1;
  }
}

export default function LevelEditor() {
  const { user, setOpenAuth } = useAuth();
  const { emitAck, feed } = useGame();
  const [level, setLevel] = useState<LevelData>(() => newEditorLevel(60));
  const levelRef = useRef(level);
  const [past, setPast] = useState<LevelData[]>([]);
  const [future, setFuture] = useState<LevelData[]>([]);
  const [tool, setTool] = useState<Tool>("solid");
  const [opts, setOpts] = useState<ToolOptions>(DEFAULT_OPTIONS);
  const [name, setName] = useState("");
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [testLevel, setTestLevel] = useState<LevelData | null>(null);
  const [testPassed, setTestPassed] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeStart = useRef<LevelData | null>(null);
  const painting = useRef<{ tool: Tool } | null>(null);
  const lastCell = useRef("");

  const commit = useCallback((n: LevelData) => {
    levelRef.current = n;
    setLevel(n);
    setResult(null);
    setTestPassed(false);
  }, []);

  // load draft
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as { name?: string; level?: LevelData };
      if (d.level && d.level.v === 1) {
        const l = toEditorLevel(d.level);
        levelRef.current = l;
        setLevel(l);
        setName(d.name ?? "");
      }
    } catch {
      /* ignore broken drafts */
    }
  }, []);
  // save draft
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, level: exportLevel(level) }));
      } catch {
        /* storage may be full/unavailable */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [level, name]);

  // render
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = level.width * CS;
    c.height = level.height * CS;
    const ctx = c.getContext("2d")!;
    draw(ctx, level, hover, tool, opts);
  }, [level, hover, tool, opts]);

  const undo = useCallback(() => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([levelRef.current, ...future].slice(0, 100));
    commit(prev);
  }, [past, future, commit]);
  const redo = useCallback(() => {
    if (!future.length) return;
    const [next, ...rest] = future;
    setPast([...past, levelRef.current].slice(-100));
    setFuture(rest);
    commit(next);
  }, [past, future, commit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const cellFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * levelRef.current.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * levelRef.current.height);
    return { x, y };
  };

  const paint = (x: number, y: number, t: Tool) => {
    const prev = levelRef.current;
    const n = cloneLevel(prev);
    if (!applyTool(n, t, x, y, opts)) return;
    if (!strokeStart.current) {
      strokeStart.current = prev;
      setPast((p) => [...p.slice(-99), prev]);
      setFuture([]);
    }
    commit(n);
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const t: Tool = e.button === 2 ? "erase" : tool;
    painting.current = { tool: t };
    strokeStart.current = null;
    const { x, y } = cellFromEvent(e);
    lastCell.current = `${x},${y}`;
    paint(x, y, t);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = cellFromEvent(e);
    setHover((h) => (h && h.x === x && h.y === y ? h : { x, y }));
    if (!painting.current) return;
    const k = `${x},${y}`;
    if (k === lastCell.current) return;
    lastCell.current = k;
    paint(x, y, painting.current.tool);
  };
  const onUp = () => {
    painting.current = null;
    strokeStart.current = null;
  };

  const exported = () => exportLevel(levelRef.current);

  const runValidate = () => {
    setValidating(true);
    setResult(null);
    setTimeout(() => {
      setResult(validateLevel(exported(), { maxNodes: 120000 }));
      setValidating(false);
    }, 30);
  };

  const runTest = () => {
    const ex = exported();
    const errs = validateLevelStructure(ex);
    if (errs.length) return setResult({ ok: false, errors: errs });
    setTestPassed(false);
    setTestLevel(ex);
  };

  const submit = async () => {
    if (!user) return setOpenAuth(true);
    setSubmitting(true);
    setSubmitMsg(null);
    const res = await emitAck<{ id: string; difficulty: number }>("level:submit", { name, data: exported() });
    setSubmitting(false);
    if (res.ok) setSubmitMsg({ ok: true, text: "Level validated and published! Players can now vote on it and it may appear in the live game." });
    else setSubmitMsg({ ok: false, text: res.error });
  };

  const counts = {
    platforms: level.solids.length,
    hazards: level.spikes.length + level.pits.length + level.hidden.length + level.fakeDoors.length,
    moving: level.movers.length + level.fallers.length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-pixel glow-text text-lg text-white">LEVEL EDITOR</h1>
          <p className="mt-2 text-slate-400">
            Paint a level, test it yourself, then submit. The server re-validates every level with the real game physics before it
            becomes playable.
          </p>
        </div>
        <div className="text-slate-400">
          {counts.platforms} blocks · {counts.hazards} hazards · {counts.moving} moving
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[230px_1fr]">
        <aside className="card space-y-3 p-3">
          <div className="label-px">Tools</div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                className={`flex items-center gap-2 rounded-lg border-2 px-2 py-1.5 text-left transition-colors ${
                  tool === t.id ? "border-violet bg-violet/20 text-white" : "border-line bg-navy/60 text-slate-300 hover:border-slate-500"
                }`}
              >
                <span className="h-4 w-4 shrink-0 rounded-sm" style={{ background: t.color }} />
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-500">{TOOLS.find((t) => t.id === tool)?.hint}</p>

          {tool === "mover" && (
            <div className="space-y-2 rounded-lg border border-line p-2">
              <Num label="Width" v={opts.moverW} min={1} max={6} onChange={(v) => setOpts({ ...opts, moverW: v })} />
              <Num label="Range" v={opts.moverRange} min={1} max={12} onChange={(v) => setOpts({ ...opts, moverRange: v })} />
              <Num label="Speed" v={opts.moverSpeed} min={0.5} max={3.5} step={0.5} onChange={(v) => setOpts({ ...opts, moverSpeed: v })} />
              <div className="flex gap-2">
                {(["x", "y"] as const).map((a) => (
                  <button
                    key={a}
                    className={`btn btn-sm flex-1 ${opts.moverAxis === a ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setOpts({ ...opts, moverAxis: a })}
                  >
                    {a === "x" ? "↔ HORIZ" : "↕ VERT"}
                  </button>
                ))}
              </div>
            </div>
          )}
          {tool === "faller" && (
            <div className="rounded-lg border border-line p-2">
              <Num label="Width" v={opts.fallerW} min={1} max={6} onChange={(v) => setOpts({ ...opts, fallerW: v })} />
            </div>
          )}

          <div className="label-px pt-2">Level width</div>
          <Num
            label="Tiles"
            v={level.width}
            min={24}
            max={150}
            step={4}
            onChange={(v) => {
              const prev = levelRef.current;
              setPast((p) => [...p.slice(-99), prev]);
              setFuture([]);
              commit(resizeLevel(prev, v));
            }}
          />
        </aside>

        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-ghost btn-sm" onClick={undo} disabled={!past.length}>
              ↶ UNDO
            </button>
            <button className="btn btn-ghost btn-sm" onClick={redo} disabled={!future.length}>
              ↷ REDO
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (!window.confirm("Clear the whole level?")) return;
                const prev = levelRef.current;
                setPast((p) => [...p.slice(-99), prev]);
                setFuture([]);
                commit(newEditorLevel(prev.width));
              }}
            >
              ✕ CLEAR
            </button>
            <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
            <button className="btn btn-blue btn-sm" onClick={runTest}>
              ▶ TEST LEVEL
            </button>
            <button className="btn btn-ghost btn-sm" onClick={runValidate} disabled={validating}>
              {validating ? "CHECKING…" : "✓ VALIDATE"}
            </button>
          </div>

          <div className="card overflow-auto p-2" style={{ maxHeight: "70vh" }}>
            <canvas
              ref={canvasRef}
              className="block cursor-crosshair touch-none rounded-md"
              style={{ imageRendering: "pixelated" }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={() => setHover(null)}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>

          {result && (
            <div className={`card animate-pop p-3 ${result.ok ? "border-mint/70" : "border-hot/70"}`}>
              {result.ok ? (
                <p className="text-mint">
                  ✓ Completable! A route to the exit exists (about {((result.frames ?? 0) / 60).toFixed(1)}s). Estimated difficulty{" "}
                  {result.difficulty}/5.
                </p>
              ) : (
                <ul className="list-inside list-disc text-hot">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="card space-y-3 p-3">
            <div className="label-px">Save &amp; submit</div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1">
                <label className="label-px mb-1 block">Level name</label>
                <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spike Symphony" />
              </div>
              <button className="btn btn-primary" disabled={submitting || name.trim().length < 3 || !feed.connected} onClick={submit}>
                {submitting ? "VALIDATING…" : "SUBMIT LEVEL"}
              </button>
            </div>
            <p className="text-sm text-slate-500">
              {user
                ? user.isGuest
                  ? "Guests can't submit levels — sign up for a free account."
                  : testPassed
                    ? "You cleared your own level — nice! Submit it when ready."
                    : "Tip: test your level and clear it yourself before submitting. Draft is auto-saved in this browser."
                : "You need to log in to submit."}
            </p>
            {submitMsg && (
              <p className={submitMsg.ok ? "text-mint" : "text-hot"}>
                {submitMsg.ok ? "✓ " : "✕ "}
                {submitMsg.text}{" "}
                {submitMsg.ok && (
                  <Link href="/levels" className="underline">
                    View community levels
                  </Link>
                )}
              </p>
            )}
          </div>
        </section>
      </div>

      {testLevel && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
          <div className="card card-glow w-full max-w-4xl space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-pixel text-sm text-white">TESTING YOUR LEVEL</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setTestLevel(null)}>
                ✕ CLOSE
              </button>
            </div>
            <LocalPlay level={testLevel} onWin={() => setTestPassed(true)} />
          </div>
        </div>
      )}
    </div>
  );
}

function Num({
  label,
  v,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  v: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="label-px">{label}</span>
      <input
        type="number"
        className="input !w-20 !py-1"
        value={v}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
      />
    </label>
  );
}
