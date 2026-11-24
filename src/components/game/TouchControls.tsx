"use client";

import type { GameView } from "@/game/views";

function Pad({ label, onChange, className = "" }: { label: string; onChange: (down: boolean) => void; className?: string }) {
  return (
    <button
      className={`font-pixel flex h-16 w-16 touch-none select-none items-center justify-center rounded-2xl border-2 border-line bg-panel2/90 text-lg text-white active:bg-violet/60 ${className}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onChange(true);
      }}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={label}
    >
      {label}
    </button>
  );
}

/** On-screen controls for touch devices. They only do anything for the active player. */
export default function TouchControls({ view, enabled }: { view: GameView | null; enabled: boolean }) {
  if (!view) return null;
  return (
    <div className={`flex items-center justify-between gap-4 lg:hidden ${enabled ? "" : "pointer-events-none opacity-40"}`}>
      <div className="flex gap-3">
        <Pad label="◀" onChange={(d) => (view.touch.left = d)} />
        <Pad label="▶" onChange={(d) => (view.touch.right = d)} />
      </div>
      <Pad label="JUMP" onChange={(d) => (view.touch.jump = d)} className="!w-28 text-[10px]" />
    </div>
  );
}
