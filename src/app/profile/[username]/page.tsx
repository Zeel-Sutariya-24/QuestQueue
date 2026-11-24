"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { END_REASON_TEXT, formatDuration } from "@/lib/format";

interface Profile {
  username: string;
  isGuest: boolean;
  joinedAt: string;
  own: boolean;
  stats: {
    gamesPlayed: number;
    levelsCompleted: number;
    totalDeaths: number;
    bestStreak: number;
    levelsCreated: number;
    totalPlayMs: number;
  };
  created: { id: string; name: string; status: string; rejectionReason: string | null; upvotes: number; completions: number; deaths: number }[];
  recentSessions: { startedAt: string; levelsCompleted: number; deaths: number; livesGranted: number; durationMs: number | null; endReason: string | null }[];
  votes: { levelId: string; levelName: string; vote: number | null; difficultyRating: number | null; updatedAt: string }[] | null;
}

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { token, loading } = useAuth();
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    let alive = true;
    api<Profile>(`/api/profile/${encodeURIComponent(username)}`)
      .then((r) => alive && setP(r))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [username, token, loading]);

  if (error) return <p className="card p-6 text-hot">{error}</p>;
  if (!p) return <p className="animate-blink text-slate-400">Loading profile…</p>;
  const s = p.stats;
  const cards = [
    ["Games played", s.gamesPlayed, "text-electric"],
    ["Levels completed", s.levelsCompleted, "text-mint"],
    ["Total deaths", s.totalDeaths, "text-hot"],
    ["Best streak", s.bestStreak, "text-gold"],
    ["Levels created", s.levelsCreated, "text-violet"],
    ["Time played", formatDuration(s.totalPlayMs), "text-slate-200"],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="card card-glow flex flex-wrap items-center gap-4 p-5">
        <div className="font-pixel flex h-16 w-16 items-center justify-center rounded-xl border-2 border-violet bg-violet/20 text-2xl text-white">
          {p.username[0].toUpperCase()}
        </div>
        <div>
          <h1 className="font-pixel glow-text text-lg text-white">{p.username}</h1>
          <p className="text-slate-400">
            {p.isGuest ? "Guest · " : ""}joined {new Date(p.joinedAt).toLocaleDateString()}
            {p.own && <span className="ml-2 text-mint">(you)</span>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cards.map(([label, v, color]) => (
          <div key={label} className="card p-3 text-center">
            <div className={`font-pixel text-base ${color}`}>{v}</div>
            <div className="mt-1 text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="label-px mb-3">Recent turns</h2>
          {p.recentSessions.length === 0 ? (
            <p className="text-slate-400">No finished turns yet.</p>
          ) : (
            <ul className="space-y-2">
              {p.recentSessions.map((r, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 rounded-lg bg-navy/60 px-3 py-2">
                  <span>
                    <b className="text-mint">{r.levelsCompleted}</b> levels · <b className="text-hot">{r.deaths}</b>/{r.livesGranted} deaths
                  </span>
                  <span className="text-slate-500">
                    {formatDuration(r.durationMs)} · {END_REASON_TEXT[r.endReason ?? ""] ?? r.endReason}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="label-px mb-3">Levels created</h2>
          {p.created.length === 0 ? (
            <p className="text-slate-400">
              Nothing yet.{p.own && (
                <>
                  {" "}
                  <Link href="/editor" className="text-electric underline">
                    Open the editor
                  </Link>
                </>
              )}
            </p>
          ) : (
            <ul className="space-y-2">
              {p.created.map((c) => (
                <li key={c.id} className="rounded-lg bg-navy/60 px-3 py-2">
                  <div className="flex justify-between gap-2">
                    <Link href={`/practice?level=${c.id}`} className="truncate hover:text-violet">
                      {c.name}
                    </Link>
                    <span className="text-slate-400">
                      ▲ {c.upvotes} · {c.completions} clears
                    </span>
                  </div>
                  {c.status !== "approved" && (
                    <div className="text-sm text-hot">
                      {c.status}
                      {c.rejectionReason ? `: ${c.rejectionReason}` : ""}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {p.votes && (
          <section className="card p-4 lg:col-span-2">
            <h2 className="label-px mb-3">Voting history</h2>
            {p.votes.length === 0 ? (
              <p className="text-slate-400">
                You haven&apos;t voted yet.{" "}
                <Link href="/levels" className="text-electric underline">
                  Browse levels
                </Link>
              </p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2">
                {p.votes.map((v) => (
                  <li key={v.levelId} className="flex justify-between gap-2 rounded-lg bg-navy/60 px-3 py-2">
                    <Link href={`/practice?level=${v.levelId}`} className="truncate hover:text-violet">
                      {v.levelName}
                    </Link>
                    <span className="shrink-0 text-slate-400">
                      {v.vote === 1 ? <span className="text-mint">▲</span> : v.vote === -1 ? <span className="text-hot">▼</span> : "–"}
                      {v.difficultyRating ? ` · rated ${v.difficultyRating}/5` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
