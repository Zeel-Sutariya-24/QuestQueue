"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useGame } from "@/lib/socket";
import PixelSprite from "./PixelSprite";
import { PLAYER_PAL, PLAYER_TOP, LEGS } from "@/game/textures";

const LINKS = [
  { href: "/", label: "HOME" },
  { href: "/game", label: "PLAY" },
  { href: "/queue", label: "QUEUE" },
  { href: "/levels", label: "LEVELS" },
  { href: "/editor", label: "EDITOR" },
  { href: "/leaderboard", label: "RANKS" },
];

export default function Navbar() {
  const path = usePathname();
  const { user, loading, logout, setOpenAuth } = useAuth();
  const { feed, myPosition } = useGame();
  const active = feed.turn;

  return (
    <header className="sticky top-0 z-40 border-b-2 border-line/80 bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-3">
          <PixelSprite rows={[...PLAYER_TOP, ...LEGS.idle]} palette={PLAYER_PAL} size={3} />
          <span className="font-pixel glow-text text-sm leading-none text-white">
            PIXEL<span className="text-violet">QUEUE</span>
          </span>
        </Link>
        <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
          {LINKS.map((l) => {
            const on = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`font-pixel rounded-lg px-3 py-2 text-[10px] transition-colors ${
                  on ? "bg-violet/20 text-violet" : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 sm:flex" title="Live game status">
            <span className={feed.connected ? "live-dot" : "h-2.5 w-2.5 rounded-sm bg-slate-600"} />
            <span className="text-base text-slate-300">
              {active ? (
                <>
                  <b className="text-electric">{active.username}</b> playing · {feed.queue?.waitingCount ?? 0} waiting
                </>
              ) : feed.connected ? (
                "Arena open"
              ) : (
                "Connecting…"
              )}
            </span>
          </div>
          {myPosition !== null && (
            <Link href="/queue" className="font-pixel rounded-lg bg-mint/15 px-2 py-2 text-[9px] text-mint">
              {myPosition === 0 ? "YOUR TURN" : `#${myPosition} IN QUEUE`}
            </Link>
          )}
          {loading ? null : user ? (
            <div className="flex items-center gap-2">
              <Link href={`/profile/${user.username}`} className="btn btn-ghost btn-sm">
                {user.username}
                {user.isGuest ? " (guest)" : ""}
              </Link>
              <button className="text-sm text-slate-400 hover:text-white" onClick={logout}>
                logout
              </button>
            </div>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => setOpenAuth(true)}>
              LOG IN
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
