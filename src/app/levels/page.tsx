"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LevelCard, { type LevelSummary } from "@/components/levels/LevelCard";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const SORTS = [
  { id: "top", label: "Top voted" },
  { id: "new", label: "Newest" },
  { id: "played", label: "Most played" },
  { id: "easy", label: "Easiest" },
  { id: "hard", label: "Hardest" },
];

export default function LevelsPage() {
  const { token, loading } = useAuth();
  const [sort, setSort] = useState("top");
  const [levels, setLevels] = useState<LevelSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    let alive = true;
    setLevels(null);
    setError(null);
    api<{ levels: LevelSummary[] }>(`/api/levels?sort=${sort}&limit=30`)
      .then((r) => alive && setLevels(r.levels))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [sort, token, loading]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-pixel glow-text text-lg text-white">COMMUNITY LEVELS</h1>
          <p className="mt-2 max-w-2xl text-slate-400">
            Every level here passed server-side validation — a bot proved the exit is reachable. Vote, rate the difficulty, or play
            them in practice mode. Approved levels also appear in the live game.
          </p>
        </div>
        <Link href="/editor" className="btn btn-primary">
          ✎ CREATE A LEVEL
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {SORTS.map((s) => (
          <button key={s.id} className={`btn btn-sm ${sort === s.id ? "btn-blue" : "btn-ghost"}`} onClick={() => setSort(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="card p-4 text-hot">{error}</p>
      ) : !levels ? (
        <p className="animate-blink text-slate-400">Loading levels…</p>
      ) : levels.length === 0 ? (
        <p className="card p-6 text-slate-300">No levels yet. Be the first to build one!</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {levels.map((l) => (
            <LevelCard key={l.id} level={l} />
          ))}
        </div>
      )}
    </div>
  );
}
