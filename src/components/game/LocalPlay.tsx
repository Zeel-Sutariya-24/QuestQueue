"use client";

import { useEffect, useRef, useState } from "react";
import { LocalView } from "@/game/views";
import type { LevelData } from "@/shared/types";
import { DEATH_TEXT } from "@/lib/format";
import GameCanvas from "./GameCanvas";
import TouchControls from "./TouchControls";

/** Offline play of a single level using the shared simulation (practice + editor test). */
export default function LocalPlay({
  level,
  onWin,
  extra,
}: {
  level: LevelData;
  onWin?: (ms: number, deaths: number) => void;
  extra?: React.ReactNode;
}) {
  const [view, setView] = useState<LocalView | null>(null);
  const [deaths, setDeaths] = useState(0);
  const [won, setWon] = useState<{ ms: number } | null>(null);
  const [cause, setCause] = useState<string | null>(null);
  const winRef = useRef(onWin);
  winRef.current = onWin;

  useEffect(() => {
    const v = new LocalView(level, {
      onDeath: (c, d) => {
        setDeaths(d);
        setCause(c);
      },
      onWin: (ms, d) => {
        setWon({ ms });
        winRef.current?.(ms, d);
      },
    });
    setView(v);
    setDeaths(0);
    setWon(null);
    setCause(null);
    return () => v.destroy();
  }, [level]);

  const restart = () => {
    view?.restart();
    setDeaths(0);
    setWon(null);
    setCause(null);
  };

  return (
    <div className="space-y-3">
      <div className="card relative overflow-hidden p-0">
        <div className="scanlines relative">
          <GameCanvas view={view} />
          <div className="pointer-events-none absolute left-3 top-3 flex gap-4 rounded-xl border-2 border-line bg-ink/80 px-3 py-2">
            <span>
              <span className="label-px block">Deaths</span>
              <b className="font-pixel text-[11px] text-hot">{deaths}</b>
            </span>
            {cause && !won && <span className="self-end text-hot">{DEATH_TEXT[cause]}</span>}
          </div>
          {won && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/70">
              <div className="animate-pop font-pixel glow-text text-lg text-mint">LEVEL CLEARED!</div>
              <div className="text-slate-300">
                {(won.ms / 1000).toFixed(1)}s · {deaths} {deaths === 1 ? "death" : "deaths"}
              </div>
              <button className="btn btn-primary" onClick={restart}>
                PLAY AGAIN
              </button>
            </div>
          )}
        </div>
      </div>
      <TouchControls view={view} enabled />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-ghost btn-sm" onClick={restart}>
          ↺ RESTART
        </button>
        <span className="text-slate-500">A/D or ←/→ to move · SPACE to jump</span>
        {extra}
      </div>
    </div>
  );
}
