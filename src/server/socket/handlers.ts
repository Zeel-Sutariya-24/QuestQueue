import { z } from "zod";
import type { GameServer } from "../game/GameServer";
import { RateLimiter } from "../rateLimit";
import { getUserByToken, type AuthUser } from "../services/auth";
import { submitLevel, voteOnLevel } from "../services/levels";
import type { Ack } from "@/shared/types";

const inputSchema = z
  .object({ left: z.boolean(), right: z.boolean(), jump: z.boolean() })
  .strict();

const inputLimiter = new RateLimiter(180, 1000);
const actionLimiter = new RateLimiter(12, 5000);

type AckFn = (res: Ack<unknown>) => void;
const safeAck = (cb: unknown): AckFn => (typeof cb === "function" ? (cb as AckFn) : () => {});

/** Wires every client -> server event. Everything is validated before use. */
export function registerSocketHandlers(gs: GameServer) {
  const { io } = gs;

  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      socket.data.user = typeof token === "string" ? await getUserByToken(token) : null;
    } catch {
      socket.data.user = null;
    }
    next();
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as AuthUser | null;
    gs.connect(user?.id ?? null);
    socket.join("game");

    socket.on("game:ready", () => gs.sendSync(socket));

    socket.on("queue:join", (_payload: unknown, cb?: unknown) => {
      const ack = safeAck(cb);
      if (!user) return ack({ ok: false, error: "Please log in to join the queue." });
      if (!actionLimiter.allow(`q:${socket.id}`)) return ack({ ok: false, error: "Slow down." });
      const res = gs.joinQueue(user.id, user.username);
      if (!res.ok) {
        const msg = {
          "already-queued": "You are already in the queue.",
          "already-active": "You are already playing.",
          "queue-full": "The queue is full.",
        }[res.error];
        return ack({ ok: false, error: msg });
      }
      ack({ ok: true, data: { position: res.position } });
    });

    socket.on("queue:leave", (_payload: unknown, cb?: unknown) => {
      const ack = safeAck(cb);
      if (!user) return ack({ ok: false, error: "Please log in." });
      if (!actionLimiter.allow(`q:${socket.id}`)) return ack({ ok: false, error: "Slow down." });
      const res = gs.leaveQueue(user.id);
      ack(res.ok ? { ok: true, data: { wasActive: res.wasActive } } : { ok: false, error: "You are not in the queue." });
    });

    socket.on("game:input", (payload: unknown) => {
      if (!user) return; // anonymous spectators can never send input
      if (!inputLimiter.allow(socket.id)) return;
      const parsed = inputSchema.safeParse(payload);
      if (!parsed.success) return;
      gs.handleInput(user.id, parsed.data); // server verifies the sender is the active player
    });

    socket.on("level:submit", async (payload: unknown, cb?: unknown) => {
      const ack = safeAck(cb);
      if (!user) return ack({ ok: false, error: "Please log in to submit levels." });
      if (!actionLimiter.allow(`s:${socket.id}`)) return ack({ ok: false, error: "Slow down." });
      try {
        const res = await submitLevel(user, payload);
        if (res.ok) void gs.refreshPool();
        ack(res.ok ? { ok: true, data: res } : { ok: false, error: (res.errors ?? ["Rejected"]).join(" ") });
      } catch (e) {
        console.error("[socket] level:submit failed", e);
        ack({ ok: false, error: "Server error while saving the level." });
      }
    });

    socket.on("level:vote", async (payload: unknown, cb?: unknown) => {
      const ack = safeAck(cb);
      if (!user) return ack({ ok: false, error: "Please log in to vote." });
      if (!actionLimiter.allow(`v:${socket.id}`)) return ack({ ok: false, error: "Slow down." });
      try {
        const res = await voteOnLevel(user, payload);
        ack(res.ok ? { ok: true, data: res } : { ok: false, error: res.error });
      } catch (e) {
        console.error("[socket] level:vote failed", e);
        ack({ ok: false, error: "Server error while voting." });
      }
    });

    socket.on("disconnect", () => gs.disconnect(user?.id ?? null));
  });
}
