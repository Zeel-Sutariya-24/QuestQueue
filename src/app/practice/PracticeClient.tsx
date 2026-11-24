"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import LocalPlay from "@/components/game/LocalPlay";
import { api } from "@/lib/api";
import { generateValidatedLevel } from "@/shared/generator";
import type { LevelData } from "@/shared/types";

export default function PracticeClient() {
  const params = useSearchParams();
  const levelId = params.get("level");
  const [level, setLevel] = useState<LevelData | null>(null);
  const [title, setTitle] = useState("Practice run");
  const [difficulty, setDifficulty] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback((n: number) => {
    // Same generator + solver the server uses, running locally for practice.
    setTimeout(() => {
      const g = generateValidatedLevel(n, Math.floor(Math.random() * 2 ** 30));
      setLevel(g.level);
      setTitle(`Procedural level (difficulty ${n})`);
    }, 20);
  }, []);

  useEffect(() => {
    if (levelId) {
      api<{ level: { name: string; creator: string; data: LevelData } }>(`/api/levels/${levelId}`)
        .then((r) => {
          setLevel(r.level.data);
          setTitle(`${r.level.name} — by ${r.level.creator}`);
        })
        .catch((e) => setError((e as Error).message));
    } else {
      generate(1);
    }
  }, [levelId, generate]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-pixel glow-text text-lg text-white">PRACTICE MODE</h1>
          <p className="mt-2 text-slate-400">{title} — offline, no lives, no queue. Doesn&apos;t count toward stats.</p>
        </div>
        {!levelId && (
          <div className="flex items-center gap-2">
            <label className="label-px">Difficulty</label>
            <input
              type="range"
              min={1}
              max={12}
              value={difficulty}
              onChange={(e) => setDifficulty(Number(e.target.value))}
              className="accent-violet"
            />
            <span className="font-pixel w-6 text-[10px] text-violet">{difficulty}</span>
            <button className="btn btn-primary btn-sm" onClick={() => generate(difficulty)}>
              NEW LEVEL
            </button>
          </div>
        )}
      </div>
      {error ? (
        <p className="card p-4 text-hot">{error}</p>
      ) : !level ? (
        <p className="animate-blink text-slate-400">Generating &amp; verifying level…</p>
      ) : (
        <LocalPlay level={level} />
      )}
    </div>
  );
}
