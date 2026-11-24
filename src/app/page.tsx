"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import HeroBackdrop from "@/components/home/HeroBackdrop";
import LevelCard, { type LevelSummary } from "@/components/levels/LevelCard";
import Leaderboards from "@/components/leaderboard/Leaderboards";
import QueueButton from "@/components/queue/QueueButton";
import Hearts from "@/components/ui/Hearts";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useGame } from "@/lib/socket";

const STEPS = [
  { n: "1", title: "Join the queue", text: "Everyone shares one hero. Hop in line — if nobody is playing you start instantly." },
  { n: "2", title: "Get your turn", text: "10 lives if 5 or fewer are waiting, 5 lives if more. The server hands you control automatically." },
  { n: "3", title: "Reach the exit", text: "Dodge spikes, pits, hidden traps and fake doors. Each cleared door loads a harder level." },
  { n: "4", title: "Watch, build, vote", text: "While waiting, spectate live, craft your own levels and vote on the community's creations." },
];

const HAZARDS = [
  ["▲", "Spikes", "text-slate-200"],
  ["▼", "Pits", "text-hot"],
  ["?", "Hidden traps", "text-violet"],
  ["↔", "Moving platforms", "text-electric"],
  ["▒", "Falling platforms", "text-orange-400"],
  ["▯", "Fake doors", "text-gold"],
];

export default function Home() {
  const { feed } = useGame();
  const { user, setOpenAuth } = useAuth();
  const [levels, setLevels] = useState<LevelSummary[] | null>(null);

  useEffect(() => {
    api<{ levels: LevelSummary[] }>("/api/levels?sort=top&limit=3")
      .then((r) => setLevels(r.levels))
      .catch(() => setLevels([]));
  }, []);

  const t = feed.turn;
  return (
    <div className="space-y-12">
      <section className="card relative overflow-hidden">
        <HeroBackdrop />
        <div className="relative z-10 flex min-h-[520px] flex-col items-center justify-center gap-6 px-4 py-14 text-center">
          <div className="animate-slide-up">
            <h1 className="font-pixel glow-text text-3xl leading-tight text-white sm:text-5xl">
              PIXEL<span className="text-violet">QUEUE</span>
            </h1>
            <p className="font-pixel mt-3 text-[10px] tracking-widest text-electric sm:text-xs">ONE HERO · ONE CONTROLLER · EVERYBODY WATCHING</p>
          </div>
          <p className="max-w-2xl text-xl text-slate-200">
            A live 2D platformer where the whole internet shares a single character. Wait in the queue, take your turn, and survive
            traps built by the community.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <QueueButton goToGame label="▶ PLAY NOW" />
            <Link href="/queue" className="btn btn-blue">
              JOIN QUEUE
            </Link>
            <Link href="/game" className="btn btn-ghost">
              👁 WATCH LIVE
            </Link>
          </div>
          <div className="card flex flex-wrap items-center justify-center gap-x-8 gap-y-3 bg-ink/80 px-6 py-4">
            <div>
              <div className="label-px">Now playing</div>
              <div className="font-pixel mt-1 flex items-center gap-2 text-sm text-white">
                {feed.connected && <span className="live-dot" />}
                {t ? t.username : feed.connected ? "nobody yet" : "connecting…"}
              </div>
            </div>
            {t && feed.lives && (
              <div>
                <div className="label-px mb-1">Lives</div>
                <Hearts lives={feed.lives.lives} max={t.maxLives} size={14} />
              </div>
            )}
            <div>
              <div className="label-px">Waiting</div>
              <div className="font-pixel mt-1 text-sm text-electric">{feed.queue?.waitingCount ?? 0}</div>
            </div>
            {t && (
              <div>
                <div className="label-px">Level</div>
                <div className="font-pixel mt-1 text-sm text-violet">{feed.level?.number ?? t.level}</div>
              </div>
            )}
          </div>
          {!user && (
            <button className="text-slate-300 underline decoration-violet underline-offset-4" onClick={() => setOpenAuth(true)}>
              Log in or play as a guest to join
            </button>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-pixel mb-4 text-sm text-white">HOW TO PLAY</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="card p-4">
              <div className="font-pixel mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-violet/25 text-violet">{s.n}</div>
              <h3 className="font-pixel mb-2 text-[11px] text-white">{s.title}</h3>
              <p className="text-slate-300">{s.text}</p>
            </div>
          ))}
        </div>
        <div className="card mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
          <span className="label-px">Controls</span>
          <span>
            <b className="text-white">A / ←</b> move left
          </span>
          <span>
            <b className="text-white">D / →</b> move right
          </span>
          <span>
            <b className="text-white">SPACE</b> jump
          </span>
          <span className="text-slate-500">Touch buttons appear on phones &amp; tablets.</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {HAZARDS.map(([icon, label, color]) => (
            <span key={label} className="card px-3 py-2">
              <b className={`font-pixel mr-2 text-xs ${color}`}>{icon}</b>
              {label}
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-pixel text-sm text-white">LEADERBOARD</h2>
            <Link href="/leaderboard" className="text-electric hover:underline">
              full rankings →
            </Link>
          </div>
          <Leaderboards limit={5} showTabs={false} only="topPlayers" />
        </div>
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-pixel text-sm text-white">FEATURED LEVELS</h2>
            <Link href="/levels" className="text-electric hover:underline">
              all levels →
            </Link>
          </div>
          {!levels ? (
            <p className="animate-blink text-slate-400">Loading…</p>
          ) : levels.length === 0 ? (
            <p className="card p-4 text-slate-300">No levels yet — build the first one in the editor.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {levels.map((l) => (
                <LevelCard key={l.id} level={l} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
