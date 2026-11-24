"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { formatDuration, formatEta } from "@/lib/format";
import { useGame } from "@/lib/socket";
import QueueButton from "@/components/queue/QueueButton";
import QueueList, { ActivePlayerCard } from "@/components/queue/QueueList";

export default function QueuePage() {
  const { feed, myPosition } = useGame();
  const { user } = useAuth();
  const q = feed.queue;
  const mine = q?.queue.find((e) => e.userId === user?.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-pixel glow-text text-lg text-white">THE QUEUE</h1>
        <p className="mt-2 text-slate-400">
          One hero, one controller. Wait your turn, watch the current run live, and build levels while you wait.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <ActivePlayerCard />
        <div className="card p-4">
          <div className="label-px mb-2">Your place</div>
          {!user ? (
            <p className="text-slate-300">Log in to join the queue.</p>
          ) : myPosition === null ? (
            <p className="text-slate-300">You&apos;re not in the queue.</p>
          ) : myPosition === 0 ? (
            <p className="text-gold">
              It&apos;s your turn! <Link href="/game" className="underline">Go to the game →</Link>
            </p>
          ) : (
            <div>
              <div className="font-pixel text-xl text-violet">#{myPosition}</div>
              <div className="text-slate-300">Estimated wait: {formatEta(mine?.etaMs)}</div>
            </div>
          )}
          <div className="mt-4">
            <QueueButton goToGame={false} />
          </div>
        </div>
        <div className="card p-4">
          <div className="label-px mb-2">Queue stats</div>
          <dl className="space-y-1 text-slate-300">
            <div className="flex justify-between">
              <dt>Waiting</dt>
              <dd className="text-electric">{q?.waitingCount ?? 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Avg. turn</dt>
              <dd className="text-mint">{q?.avgTurnMs ? formatDuration(q.avgTurnMs) : "not enough data"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Next turn lives</dt>
              <dd className="text-hot">{(q?.waitingCount ?? 0) > 6 ? 5 : 10}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Connection</dt>
              <dd className={feed.connected ? "text-mint" : "text-hot"}>{feed.connected ? "live" : "reconnecting…"}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <QueueList />
        <div className="card p-4 text-slate-300">
          <div className="label-px mb-2">While you wait</div>
          <ul className="space-y-2">
            <li>
              <Link className="text-electric hover:underline" href="/game">
                👁 Watch the live run
              </Link>
            </li>
            <li>
              <Link className="text-electric hover:underline" href="/editor">
                ✎ Build a level
              </Link>
            </li>
            <li>
              <Link className="text-electric hover:underline" href="/levels">
                ▲ Vote on community levels
              </Link>
            </li>
            <li>
              <Link className="text-electric hover:underline" href="/practice">
                ▶ Practice offline
              </Link>
            </li>
          </ul>
          <p className="mt-4 text-sm text-slate-500">
            Refreshing the page is safe — your spot is held while you reconnect.
          </p>
        </div>
      </div>
    </div>
  );
}
