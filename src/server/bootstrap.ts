import http from "node:http";
import { Server } from "socket.io";
import { GameServer } from "./game/GameServer";
import { createMirror } from "./redis";
import { registerSocketHandlers } from "./socket/handlers";

const g = globalThis as typeof globalThis & { __pixelQueueGame?: GameServer | "starting" };

export function getGameServer(): GameServer | null {
  return g.__pixelQueueGame && g.__pixelQueueGame !== "starting" ? g.__pixelQueueGame : null;
}

/** Boots the Socket.IO game server inside the same Node process as Next.js. */
export async function startGameServer(): Promise<void> {
  if (g.__pixelQueueGame) return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  g.__pixelQueueGame = "starting";

  const port = Number(process.env.PORT || process.env.GAME_SERVER_PORT || 4001);
  const httpServer = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  // Next's rewrite proxy strips the trailing slash ("/socket.io?EIO=4"); Engine.IO expects "/socket.io/".
  const fixUrl = (req: http.IncomingMessage) => {
    if (req.url?.startsWith("/socket.io?")) req.url = req.url.replace("/socket.io?", "/socket.io/?");
  };
  httpServer.prependListener("request", fixUrl);
  httpServer.prependListener("upgrade", fixUrl);
  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: true, credentials: true },
    pingInterval: 20000,
    pingTimeout: 20000,
    maxHttpBufferSize: 2e6,
  });
  const gs = new GameServer(io, createMirror());
  registerSocketHandlers(gs);

  const listening = await new Promise<boolean>((resolve) => {
    httpServer.once("error", (e) => {
      console.error(`[game] cannot listen on port ${port}:`, (e as Error).message);
      resolve(false);
    });
    httpServer.listen(port, "0.0.0.0", () => resolve(true));
  });
  if (!listening) {
    g.__pixelQueueGame = undefined;
    return;
  }
  g.__pixelQueueGame = gs;
  console.log(`[game] Socket.IO game server listening on :${port}`);
  await gs.init().catch((e) => console.error("[game] init failed", e));
}
