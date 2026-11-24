"use client";

import { useEffect, useRef } from "react";
import type { GameView } from "@/game/views";

/** Mounts the Phaser game (client-only, lazily imported) and renders the given view. */
export default function GameCanvas({ view, className = "" }: { view: GameView | null; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!view || !ref.current) return;
    let game: import("phaser").Game | null = null;
    let cancelled = false;
    (async () => {
      const [Phaser, { GameScene, VIEW_W, VIEW_H }] = await Promise.all([
        import("phaser"),
        import("@/game/GameScene"),
      ]);
      if (cancelled || !ref.current) return;
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: ref.current,
        width: VIEW_W,
        height: VIEW_H,
        pixelArt: true,
        backgroundColor: "#070815",
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        audio: { noAudio: true },
        banner: false,
        scene: [],
      });
      game.scene.add("game", GameScene, true, { view });
    })();
    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, [view]);

  return <div ref={ref} className={`aspect-video w-full overflow-hidden bg-[#070815] ${className}`} />;
}
