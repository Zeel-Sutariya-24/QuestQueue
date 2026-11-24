"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";

export default function AuthModal() {
  const { openAuth, setOpenAuth, login, register, guest } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!openAuth) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setPassword("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={() => setOpenAuth(false)}
    >
      <div className="card card-glow animate-pop w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-pixel glow-text text-sm text-white">{mode === "login" ? "WELCOME BACK" : "NEW PLAYER"}</h2>
          <button className="text-slate-400 hover:text-white" onClick={() => setOpenAuth(false)} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              className={`btn btn-sm ${mode === m ? "btn-primary" : "btn-ghost"}`}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
            >
              {m === "login" ? "LOG IN" : "SIGN UP"}
            </button>
          ))}
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => (mode === "login" ? login(username, password) : register(username, password)));
          }}
        >
          <div>
            <label className="label-px mb-1 block">Username</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              maxLength={16}
              required
            />
          </div>
          <div>
            <label className="label-px mb-1 block">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              required
            />
          </div>
          {error && <p className="rounded-lg border border-hot/50 bg-hot/10 px-3 py-2 text-hot">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy} type="submit">
            {busy ? "..." : mode === "login" ? "LOG IN" : "CREATE ACCOUNT"}
          </button>
        </form>
        <div className="my-4 flex items-center gap-3 text-slate-500">
          <div className="h-px flex-1 bg-line" />
          or
          <div className="h-px flex-1 bg-line" />
        </div>
        <button className="btn btn-blue w-full" disabled={busy} onClick={() => void run(guest)}>
          PLAY AS GUEST
        </button>
        <p className="mt-3 text-center text-sm text-slate-500">Guests can play and watch but cannot submit levels or vote.</p>
      </div>
    </div>
  );
}
