"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  Ack,
  DeathCause,
  GameStatePayload,
  LevelLoadedPayload,
  QueueSnapshot,
  TurnView,
} from "@/shared/types";
import { useAuth } from "./auth";

export interface Banner {
  id: number;
  kind: "died" | "level" | "ended" | "turn";
  text: string;
}

export interface LevelInfo {
  number: number;
  name: string;
  source: string;
  creator: string | null;
  difficulty: number;
}

export interface Feed {
  connected: boolean;
  queue: QueueSnapshot | null;
  turn: TurnView | null;
  lives: { lives: number; maxLives: number; deaths: number } | null;
  level: LevelInfo | null;
  progress: number;
  banner: Banner | null;
}

interface SocketCtx {
  socket: Socket | null;
  feed: Feed;
  /** 0 = playing now, n = position in queue, null = not queued */
  myPosition: number | null;
  isMyTurn: boolean;
  emitAck<T = unknown>(event: string, payload?: unknown): Promise<Ack<T>>;
}

const initial: Feed = { connected: false, queue: null, turn: null, lives: null, level: null, progress: 0, banner: null };
const Ctx = createContext<SocketCtx | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token, user, loading } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [feed, setFeed] = useState<Feed>(initial);
  const userId = useRef<string | null>(null);
  userId.current = user?.id ?? null;
  const progressRef = useRef(0);
  const bannerId = useRef(0);

  useEffect(() => {
    if (loading) return;
    const opts = { path: "/socket.io", auth: { token }, transports: ["websocket", "polling"], reconnectionDelayMax: 3000 };
    const url = process.env.NEXT_PUBLIC_SOCKET_URL;
    const s = url ? io(url, opts) : io(opts);
    const banner = (kind: Banner["kind"], text: string) =>
      setFeed((f) => ({ ...f, banner: { id: ++bannerId.current, kind, text } }));

    s.on("connect", () => {
      setFeed((f) => ({ ...f, connected: true }));
      s.emit("game:ready");
    });
    s.on("disconnect", () => setFeed((f) => ({ ...f, connected: false })));
    s.on("queue:updated", (q: QueueSnapshot) => setFeed((f) => ({ ...f, queue: q })));
    s.on("game:player-changed", (p: { turn: TurnView | null }) => {
      progressRef.current = 0;
      setFeed((f) => ({
        ...f,
        turn: p.turn,
        lives: p.turn ? { lives: p.turn.lives, maxLives: p.turn.maxLives, deaths: p.turn.deaths } : null,
        level: p.turn ? f.level : null,
        progress: 0,
      }));
    });
    s.on("game:started", (p: { turn: TurnView }) => {
      if (p.turn.userId === userId.current) banner("turn", `YOUR TURN! ${p.turn.maxLives} lives`);
    });
    s.on("game:level-loaded", (p: LevelLoadedPayload) =>
      setFeed((f) => ({
        ...f,
        level: { number: p.number, name: p.name, source: p.source, creator: p.creator, difficulty: p.difficulty },
        progress: 0,
      })),
    );
    s.on("game:state", (p: GameStatePayload) => {
      progressRef.current = p.progress;
    });
    s.on("game:lives-updated", (p: { lives: number; maxLives: number; deaths: number }) =>
      setFeed((f) => ({ ...f, lives: p, turn: f.turn ? { ...f.turn, lives: p.lives, deaths: p.deaths } : f.turn })),
    );
    s.on("game:player-died", (p: { cause: DeathCause; lives: number }) =>
      banner("died", p.lives > 0 ? `OUCH! ${p.lives} ${p.lives === 1 ? "life" : "lives"} left` : "OUT OF LIVES"),
    );
    s.on("game:level-completed", (p: { number: number; next: number }) => {
      banner("level", `LEVEL ${p.number} CLEARED!`);
      setFeed((f) => ({ ...f, turn: f.turn ? { ...f.turn, level: p.next } : f.turn }));
    });
    s.on("game:ended", (p: { username: string; reason: string }) => banner("ended", `${p.username}'s turn is over`));

    const timer = setInterval(() => {
      setFeed((f) => (Math.abs(f.progress - progressRef.current) > 0.004 ? { ...f, progress: progressRef.current } : f));
    }, 250);
    setSocket(s);
    return () => {
      clearInterval(timer);
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
      setFeed(initial);
    };
  }, [token, loading]);

  const emitAck = useCallback(
    <T,>(event: string, payload?: unknown): Promise<Ack<T>> =>
      new Promise((resolve) => {
        if (!socket || !socket.connected) return resolve({ ok: false, error: "Not connected to the game server." });
        const timer = setTimeout(() => resolve({ ok: false, error: "The server took too long to respond." }), 15000);
        socket.emit(event, payload, (res: Ack<T>) => {
          clearTimeout(timer);
          resolve(res);
        });
      }),
    [socket],
  );

  const value = useMemo<SocketCtx>(() => {
    const uid = user?.id;
    let myPosition: number | null = null;
    if (uid) {
      if (feed.turn?.userId === uid) myPosition = 0;
      else myPosition = feed.queue?.queue.find((e) => e.userId === uid)?.position ?? null;
    }
    return { socket, feed, myPosition, isMyTurn: myPosition === 0, emitAck };
  }, [socket, feed, user, emitAck]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame(): SocketCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGame must be used inside SocketProvider");
  return v;
}
