"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LiveView } from "@/game/views";
import { useAuth } from "@/lib/auth";
import { formatEta } from "@/lib/format";
import { useGame } from "@/lib/socket";
import Hearts from "@/components/ui/Hearts";
import { ActivePlayerCard } from "@/components/queue/QueueList";
import QueueList from "@/components/queue/QueueList";
import QueueButton from "@/components/queue/QueueButton";
import GameCanvas from "./GameCanvas";
import TouchControls from "./TouchControls";
import { Skulls } from "@/components/levels/LevelCard";

const BANNER_STYLE: Record<string, string> = {
  died: "border-hot text-hot",
  level: "border-mint text-mint",
  ended: "border-violet text-violet",
  turn: "border-gold text-gold",
};

export default function GameArena() {
  const { socket, feed, isMyTurn, myPosition } = useGame();
  const { user } = useAuth();
  const [view, setView] = useState<LiveView | null>(null);
  const [bannerShown, setBannerShown] = useState<number | null>(null);

  useEffect(() => {
    if (!socket) return;
    const v = new LiveView(socket);
    setView(v);
    return () => {
      v.destroy();
      setView(null);
    };
  }, [socket]);

  useEffect(() => {
    if (!view) return;
    view.canControl = isMyTurn;
    view.playerName = feed.turn?.username ?? "";
    if (!isMyTurn) view.touch.left = view.touch.right = view.touch.jump = false;
  }, [view, isMyTurn, feed.turn?.username]);

  const bannerId = feed.banner?.id ?? null;
  useEffect(() => {
    if (bannerId === null) return;
    setBannerShown(bannerId);
    const t = setTimeout(() => setBannerShown(null), 1800);
    return () => clearTimeout(t);
  }, [bannerId]);

  const turn = feed.turn;
  const lives = feed.lives;
  const status = !feed.connected
    ? "RECONNECTING"
    : !turn
      ? "IDLE"
      : isMyTurn
        ? "YOU ARE PLAYING"
        : "SPECTATING";
  const eta = feed.queue?.queue.find((e) => e.userId === user?.id)?.etaMs;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        <div className="card relative overflow-hidden p-0">
          <div className="scanlines relative">
            <GameCanvas view={view} />

            {/* HUD */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
              <div className="rounded-xl border-2 border-line bg-ink/80 px-3 py-2 backdrop-blur">
                <div className="label-px">{turn ? "Player" : "Arena"}</div>
                <div className="font-pixel max-w-[10rem] truncate text-[11px] text-white sm:max-w-[16rem]">
                  {turn?.username ?? "— nobody —"}
                </div>
                <div className={`font-pixel mt-1 text-[8px] ${isMyTurn ? "text-gold" : "text-electric"}`}>{status}</div>
              </div>
              <div className="rounded-xl border-2 border-line bg-ink/80 px-3 py-2 backdrop-blur">
                <div className="label-px mb-1">Lives</div>
                {turn && lives ? <Hearts lives={lives.lives} max={lives.maxLives} size={16} /> : <span className="text-slate-500">—</span>}
              </div>
              <div className="hidden rounded-xl border-2 border-line bg-ink/80 px-3 py-2 backdrop-blur sm:block">
                <div className="flex gap-4 text-base">
                  <span>
                    <span className="label-px block">Level</span>
                    <b className="font-pixel text-[11px] text-electric">{turn ? (feed.level?.number ?? turn.level) : "-"}</b>
                  </span>
                  <span>
                    <span className="label-px block">Deaths</span>
                    <b className="font-pixel text-[11px] text-hot">{turn ? (lives?.deaths ?? 0) : "-"}</b>
                  </span>
                  <span>
                    <span className="label-px block">Queue</span>
                    <b className="font-pixel text-[11px] text-violet">{feed.queue?.waitingCount ?? 0}</b>
                  </span>
                </div>
              </div>
            </div>

            {/* level info + progress */}
            {turn && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
                <div className="flex items-center justify-between gap-3 text-base text-slate-300">
                  <span className="truncate rounded-md bg-ink/70 px-2 py-0.5">
                    {feed.level ? (
                      <>
                        {feed.level.name}
                        {feed.level.creator ? <span className="text-slate-500"> · by {feed.level.creator}</span> : null}
                      </>
                    ) : (
                      "Loading level…"
                    )}
                  </span>
                  {feed.level && (
                    <span className="rounded-md bg-ink/70 px-2 py-0.5">
                      <Skulls n={feed.level.difficulty} />
                    </span>
                  )}
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full border border-line bg-ink/80">
                  <div
                    className="h-full bg-gradient-to-r from-violet to-electric transition-all duration-300"
                    style={{ width: `${Math.round(feed.progress * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* banner */}
            {feed.banner && bannerShown === feed.banner.id && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  key={feed.banner.id}
                  className={`animate-pop font-pixel rounded-xl border-4 bg-ink/90 px-6 py-4 text-center text-sm ${BANNER_STYLE[feed.banner.kind]}`}
                >
                  {feed.banner.text}
                </div>
              </div>
            )}

            {/* idle overlay */}
            {!turn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink/60 p-4 text-center">
                <div className="font-pixel glow-text text-base text-white sm:text-xl">
                  {feed.connected ? "THE ARENA IS EMPTY" : "CONNECTING…"}
                </div>
                <p className="max-w-md text-slate-300">
                  {feed.connected
                    ? "Join the queue — when nobody is playing you start right away."
                    : "Waiting for the game server. This page reconnects automatically."}
                </p>
                {feed.connected && <QueueButton />}
              </div>
            )}
          </div>
        </div>

        <TouchControls view={view} enabled={isMyTurn} />

        <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 p-3 text-slate-300">
          <span className="label-px">Controls</span>
          <span>
            <Key>A</Key>/<Key>←</Key> left
          </span>
          <span>
            <Key>D</Key>/<Key>→</Key> right
          </span>
          <span>
            <Key>SPACE</Key> jump
          </span>
          <span className="ml-auto text-slate-500">
            {isMyTurn ? "You have control." : "Only the active player can move — you're watching live."}
          </span>
        </div>
      </div>

      <aside className="space-y-4">
        <ActivePlayerCard />
        <div className="card p-4">
          <div className="label-px mb-2">Your status</div>
          {!user ? (
            <p className="mb-3 text-slate-300">Log in or play as a guest to join the queue.</p>
          ) : myPosition === null ? (
            <p className="mb-3 text-slate-300">You are watching. Join to get a turn!</p>
          ) : myPosition === 0 ? (
            <p className="mb-3 text-gold">It&apos;s your turn — good luck!</p>
          ) : (
            <p className="mb-3 text-slate-300">
              Position <b className="text-violet">#{myPosition}</b> · estimated wait <b className="text-mint">{formatEta(eta)}</b>
            </p>
          )}
          <QueueButton />
          <p className="mt-3 text-sm text-slate-500">
            {turn
              ? `${turn.maxLives} lives this turn (${turn.queueSizeAtStart} were waiting when it began).`
              : "More than 5 waiting = 5 lives, otherwise 10."}
          </p>
        </div>
        <QueueList compact />
        {myPosition !== null && myPosition > 0 && (
          <Link href="/editor" className="card block p-4 transition-colors hover:border-violet">
            <div className="font-pixel mb-1 text-[10px] text-violet">WAITING?</div>
            <span className="text-slate-300">Build a level for future players in the editor →</span>
          </Link>
        )}
      </aside>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-pixel mx-0.5 rounded border-2 border-line bg-navy px-1.5 py-1 text-[9px] text-white">{children}</kbd>
  );
}
