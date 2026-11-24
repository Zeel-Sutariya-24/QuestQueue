export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function formatEta(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "Calculating…";
  if (ms < 5000) return "any moment";
  return `~${formatDuration(ms)}`;
}

export const END_REASON_TEXT: Record<string, string> = {
  "lives-exhausted": "ran out of lives",
  timeout: "reached the turn time limit",
  afk: "went idle",
  disconnected: "disconnected",
  left: "left the game",
  shutdown: "server restarted",
};

export const DEATH_TEXT: Record<string, string> = {
  spike: "Impaled by spikes",
  pit: "Fell into a pit",
  "hidden-trap": "Hidden trap!",
  "fake-door": "That door was fake!",
  fall: "Fell out of the world",
};
