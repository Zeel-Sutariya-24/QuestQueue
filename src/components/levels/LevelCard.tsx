"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useGame } from "@/lib/socket";
import LevelPreview from "@/components/ui/LevelPreview";
import type { LevelData } from "@/shared/types";

export interface LevelSummary {
  id: string;
  name: string;
  creator: string;
  data: LevelData;
  source: string;
  difficulty: number;
  upvotes: number;
  downvotes: number;
  plays: number;
  completions: number;
  deaths: number;
  completionRate: number | null;
  width: number;
  myVote: number;
  myRating: number | null;
}

export function Skulls({ n }: { n: number }) {
  return (
    <span className="font-pixel text-[10px] tracking-widest" title={`Difficulty ${n}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={i < n ? (n >= 4 ? "text-hot" : n >= 3 ? "text-gold" : "text-mint") : "text-slate-700"}>
          ■
        </span>
      ))}
    </span>
  );
}

export default function LevelCard({ level, interactive = true }: { level: LevelSummary; interactive?: boolean }) {
  const { user, setOpenAuth } = useAuth();
  const { emitAck } = useGame();
  const [l, setL] = useState(level);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const own = user?.username === l.creator;

  const vote = async (payload: { vote?: 1 | -1 | 0; difficulty?: number }) => {
    if (!user) return setOpenAuth(true);
    setBusy(true);
    setErr(null);
    const res = await emitAck<{ upvotes: number; downvotes: number }>("level:vote", { levelId: l.id, ...payload });
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    setL((p) => ({
      ...p,
      upvotes: res.data?.upvotes ?? p.upvotes,
      downvotes: res.data?.downvotes ?? p.downvotes,
      myVote: payload.vote !== undefined ? payload.vote : p.myVote,
      myRating: payload.difficulty ?? p.myRating,
    }));
  };

  return (
    <article className="card animate-slide-up flex flex-col gap-3 p-4">
      <Link href={`/practice?level=${l.id}`} className="group relative block overflow-hidden rounded-lg">
        <LevelPreview level={l.data} scale={5} />
        <span className="font-pixel absolute inset-0 flex items-center justify-center bg-ink/70 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
          ▶ PLAY / TEST
        </span>
      </Link>
      <div>
        <h3 className="font-pixel truncate text-[11px] text-white">{l.name}</h3>
        <p className="text-slate-400">
          by{" "}
          <Link href={`/profile/${l.creator}`} className="text-electric hover:underline">
            {l.creator}
          </Link>
          {l.source === "seed" && <span className="ml-2 text-violet">★ official</span>}
        </p>
      </div>
      <div className="flex items-center justify-between text-slate-300">
        <Skulls n={l.difficulty} />
        <span>
          {l.completionRate === null ? "no attempts yet" : `${l.completionRate}% clear rate`}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-base">
        <Stat label="Plays" v={l.plays} />
        <Stat label="Clears" v={l.completions} />
        <Stat label="Deaths" v={l.deaths} />
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        <button
          className={`btn btn-sm ${l.myVote === 1 ? "btn-primary" : "btn-ghost"}`}
          disabled={busy || !interactive || own}
          onClick={() => vote({ vote: l.myVote === 1 ? 0 : 1 })}
          title={own ? "You can't vote on your own level" : "Upvote"}
        >
          ▲ {l.upvotes}
        </button>
        <button
          className={`btn btn-sm ${l.myVote === -1 ? "btn-danger" : "btn-ghost"}`}
          disabled={busy || !interactive || own}
          onClick={() => vote({ vote: l.myVote === -1 ? 0 : -1 })}
          title="Downvote"
        >
          ▼ {l.downvotes}
        </button>
        <select
          className="input !w-auto !py-1.5 !text-base"
          disabled={busy || !interactive || own}
          value={l.myRating ?? ""}
          onChange={(e) => e.target.value && vote({ difficulty: Number(e.target.value) })}
          aria-label="Rate difficulty"
        >
          <option value="">Rate difficulty</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} — {["Easy", "Medium", "Hard", "Brutal", "Insane"][n - 1]}
            </option>
          ))}
        </select>
      </div>
      {err && <p className="text-sm text-hot">{err}</p>}
    </article>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded-lg bg-navy/70 py-1">
      <div className="font-pixel text-[10px] text-white">{v}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}
