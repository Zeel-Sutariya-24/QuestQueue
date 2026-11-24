"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useGame } from "@/lib/socket";

/** Join / leave the global queue. All state comes from the server. */
export default function QueueButton({
  size = "md",
  goToGame = false,
  label,
}: {
  size?: "sm" | "md";
  goToGame?: boolean;
  label?: string;
}) {
  const { user, setOpenAuth } = useAuth();
  const { feed, myPosition, emitAck } = useGame();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cls = size === "sm" ? "btn-sm" : "";

  const join = async () => {
    if (!user) return setOpenAuth(true);
    setBusy(true);
    setError(null);
    const res = await emitAck("queue:join");
    setBusy(false);
    if (!res.ok) setError(res.error);
    else if (goToGame) router.push("/game");
  };
  const leave = async () => {
    setBusy(true);
    setError(null);
    const res = await emitAck("queue:leave");
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      {myPosition === null ? (
        <button className={`btn btn-primary ${cls}`} onClick={join} disabled={busy || !feed.connected}>
          {busy ? "JOINING…" : (label ?? "JOIN QUEUE")}
        </button>
      ) : (
        <button className={`btn btn-danger ${cls}`} onClick={leave} disabled={busy}>
          {busy ? "…" : myPosition === 0 ? "END MY TURN" : "LEAVE QUEUE"}
        </button>
      )}
      {error && <span className="text-sm text-hot">{error}</span>}
    </div>
  );
}
