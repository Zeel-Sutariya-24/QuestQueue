"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { formatEta } from "@/lib/format";
import { useGame } from "@/lib/socket";
import Hearts from "@/components/ui/Hearts";

export function ActivePlayerCard() {
  const { feed } = useGame();
  const t = feed.turn;
  return (
    <div className="card card-glow p-4">
      <div className="label-px mb-2">Now playing</div>
      {t ? (
        <div className="space-y-2">
          <Link href={`/profile/${t.username}`} className="font-pixel glow-text block truncate text-sm text-white hover:text-violet">
            {t.username}
          </Link>
          <Hearts lives={feed.lives?.lives ?? t.lives} max={t.maxLives} size={16} />
          <div className="flex gap-4 text-slate-300">
            <span>
              Level <b className="text-electric">{t.level}</b>
            </span>
            <span>
              Deaths <b className="text-hot">{feed.lives?.deaths ?? t.deaths}</b>
            </span>
          </div>
        </div>
      ) : (
        <p className="text-slate-400">Nobody is playing. The next player to join starts immediately!</p>
      )}
    </div>
  );
}

export default function QueueList({ compact = false }: { compact?: boolean }) {
  const { feed } = useGame();
  const { user } = useAuth();
  const q = feed.queue;
  const entries = q?.queue ?? [];
  const shown = compact ? entries.slice(0, 8) : entries;

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="label-px">Waiting line</div>
        <div className="font-pixel text-[10px] text-electric">{q?.waitingCount ?? 0} waiting</div>
      </div>
      {!q ? (
        <p className="animate-blink text-slate-400">Connecting to the queue…</p>
      ) : entries.length === 0 ? (
        <p className="text-slate-400">The queue is empty.</p>
      ) : (
        <ol className="space-y-1.5">
          {shown.map((e) => {
            const me = e.userId === user?.id;
            return (
              <li
                key={e.userId}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                  me ? "border-mint/60 bg-mint/10" : "border-line/70 bg-navy/60"
                }`}
              >
                <span className="font-pixel w-8 text-[10px] text-violet">#{e.position}</span>
                <Link href={`/profile/${e.username}`} className="flex-1 truncate hover:text-violet">
                  {e.username}
                  {me && <span className="ml-2 text-mint">(you)</span>}
                </Link>
                <span className="text-sm text-slate-400">{formatEta(e.etaMs)}</span>
              </li>
            );
          })}
          {compact && entries.length > shown.length && (
            <li className="pt-1 text-center text-slate-500">+{entries.length - shown.length} more</li>
          )}
        </ol>
      )}
      {q && q.avgTurnMs === null && (
        <p className="mt-3 text-sm text-slate-500">Wait estimates appear after a few turns have been played.</p>
      )}
    </div>
  );
}
