import Leaderboards from "@/components/leaderboard/Leaderboards";

export const metadata = { title: "Leaderboard — Quest Queue" };

export default function LeaderboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-pixel glow-text text-lg text-white">HALL OF FAME</h1>
        <p className="mt-2 text-slate-400">Top players by levels cleared, cleanest runs, longest survival streaks and best level builders.</p>
      </div>
      <Leaderboards limit={25} />
    </div>
  );
}
