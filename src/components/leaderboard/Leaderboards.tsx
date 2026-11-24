"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface PlayerRow {
  username: string;
  levelsCompleted: number;
  totalDeaths: number;
  bestStreak: number;
  gamesPlayed: number;
  deathsPerLevel?: number;
}
interface CreatorRow {
  username: string;
  levelsCreated: number;
  upvotes: number;
  completions: number;
}
interface Boards {
  topPlayers: PlayerRow[];
  fewestDeaths: PlayerRow[];
  bestStreak: PlayerRow[];
  creators: CreatorRow[];
}

const TABS = [
  { id: "topPlayers", label: "Most levels", icon: "★" },
  { id: "fewestDeaths", label: "Fewest deaths", icon: "☠" },
  { id: "bestStreak", label: "Best streak", icon: "⚡" },
  { id: "creators", label: "Top creators", icon: "✎" },
] as const;

export default function Leaderboards({ limit = 10, showTabs = true, only }: { limit?: number; showTabs?: boolean; only?: (typeof TABS)[number]["id"] }) {
  const [boards, setBoards] = useState<Boards | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>(only ?? "topPlayers");

  useEffect(() => {
    api<Boards>(`/api/leaderboard?limit=${limit}`).then(setBoards).catch((e) => setError((e as Error).message));
  }, [limit]);

  const rows = boards?.[tab] ?? [];
  const medal = (i: number) => ["text-gold", "text-slate-300", "text-orange-400"][i] ?? "text-slate-500";

  return (
    <div className="card p-4">
      {showTabs && (
        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button key={t.id} className={`btn btn-sm ${tab === t.id ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(t.id)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      )}
      {error ? (
        <p className="text-hot">{error}</p>
      ) : !boards ? (
        <p className="animate-blink text-slate-400">Loading rankings…</p>
      ) : rows.length === 0 ? (
        <p className="text-slate-400">
          {tab === "fewestDeaths" ? "Complete at least 3 levels to appear here." : "No results yet — be the first!"}
        </p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="label-px">
              <th className="w-10 pb-2">#</th>
              <th className="pb-2">Player</th>
              {tab === "creators" ? (
                <>
                  <th className="pb-2 text-right">Levels</th>
                  <th className="pb-2 text-right">Upvotes</th>
                  <th className="pb-2 text-right">Clears</th>
                </>
              ) : (
                <>
                  <th className="pb-2 text-right">{tab === "bestStreak" ? "Streak" : "Levels"}</th>
                  <th className="pb-2 text-right">{tab === "fewestDeaths" ? "Deaths/lvl" : "Deaths"}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {(rows as (PlayerRow & CreatorRow)[]).map((r, i) => (
              <tr key={r.username} className="border-t border-line/50">
                <td className={`font-pixel py-2 text-[10px] ${medal(i)}`}>{i + 1}</td>
                <td className="py-2">
                  <Link href={`/profile/${r.username}`} className="hover:text-violet">
                    {r.username}
                  </Link>
                </td>
                {tab === "creators" ? (
                  <>
                    <td className="py-2 text-right">{r.levelsCreated}</td>
                    <td className="py-2 text-right text-violet">{r.upvotes}</td>
                    <td className="py-2 text-right text-mint">{r.completions}</td>
                  </>
                ) : (
                  <>
                    <td className="py-2 text-right text-mint">{tab === "bestStreak" ? r.bestStreak : r.levelsCompleted}</td>
                    <td className="py-2 text-right text-hot">{tab === "fewestDeaths" ? r.deathsPerLevel : r.totalDeaths}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
