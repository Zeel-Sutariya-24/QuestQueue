# PIXEL QUEUE — a queue-based multiplayer 2D platformer

One hero, one controller, everybody watching. Players join a global queue; **only the player at the front controls the
character**. Everyone else spectates live, votes on community levels and builds levels in a visual editor.

- **Frontend:** Next.js (App Router) · React · TypeScript · Tailwind CSS · Phaser 3 · Socket.IO client
- **Backend:** Node.js · TypeScript · Socket.IO · PostgreSQL (Drizzle ORM) · optional Redis (ioredis)
- **Architecture:** server-authoritative simulation, WebSocket sync, game logic fully separated from the UI

## Quick start

```bash
cp .env.example .env            # set DATABASE_URL (and AUTH_SECRET)
npm install
npx drizzle-kit push            # create tables  (or: npx drizzle-kit migrate  -> uses ./drizzle/0000_init.sql)
npm run dev                     # or: npm run build && npm start
```

Open <http://localhost:3000>. Starter levels (the "seed data") are created automatically on first boot by `PixelBot`.

Run the tests (queue management, turn transitions, life rules, physics, generator, validator):

```bash
npx vitest run
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `AUTH_SECRET` | HMAC secret for login tokens |
| `GAME_SERVER_PORT` | Port of the Socket.IO game server (default `4001`) |
| `REDIS_URL` | Optional. Mirrors the live queue, active turn, turn lock and temporary game state in Redis |
| `NEXT_PUBLIC_SOCKET_URL` | Optional. Point the browser at a standalone game server instead of the built-in proxy |

## How it is wired

The Socket.IO game server boots inside the Next.js process via `src/instrumentation.ts` and listens on
`GAME_SERVER_PORT`. `next.config.ts` rewrites `/socket.io/*` to it, so the browser talks to a single origin and
the whole app deploys as one persistent Node service (`npm run build && npm start`). The backend code lives in
`src/server` and has **no dependency on React/Next**, so it can be moved to its own process by calling
`startGameServer()` from a tiny entry file and setting `NEXT_PUBLIC_SOCKET_URL`.
Serverless hosting (e.g. Vercel functions) is not suitable because the game loop needs a long-lived process.

```
src/
  shared/            pure TS shared by browser + server (no I/O)
    sim.ts             deterministic 60 Hz platformer physics (the single source of truth)
    solver.ts          bot search on the REAL physics -> proves a level is completable
    generator.ts       seeded procedural level generator (difficulty curve)
    validate.ts        schema + structural + solvability validation
    levelSchema.ts     strict zod schema (unknown keys rejected, data only, never code)
  server/
    queue/TurnManager.ts   queue, turn lock, life rules, AFK/disconnect timers (pure, unit-tested)
    game/GameServer.ts     game loop, authoritative sim, level pool, broadcasts, persistence hooks
    socket/handlers.ts     every client->server event, validated with zod + rate limited
    services/              auth, levels (submit/vote/moderation/seed), stats (sessions, events, leaderboards)
    redis.ts               optional Redis mirror (queue, active turn, turn lock, temp game state)
  game/                Phaser 3 renderer (GameScene), pixel textures, GameView adapters (live / local)
  components/ app/     React UI + pages (home, game, queue, levels, editor, leaderboard, profile, practice)
  db/schema.ts         Drizzle schema (users, game_sessions, queue_entries, levels, level_votes, player_stats, game_events)
tests/                 vitest suites
drizzle/               generated SQL migration
```

## Game rules (enforced on the server)

- Exactly one active player. `TurnManager` owns a single `active` slot that can only be filled by `startNextTurn()` while empty.
  With Redis enabled, a `SET NX` turn lock is also taken.
- **Lives:** computed once when a turn starts — more than 5 players waiting → **5 lives**, otherwise **10**. Fixed for the turn.
- Lives reaching zero ends the turn and the next player is activated automatically.
- Clients only send input *intent* (`left/right/jump`). Positions, deaths, lives and level completion are computed by the server sim.
  Spectators' and dead players' inputs are ignored.
- Duplicate queue entries per account are impossible (in memory and via a partial unique index in PostgreSQL).
- Refresh / short disconnects keep your spot (45 s grace while waiting, 15 s while playing). Disconnected players never block the queue.
  While others wait, a turn ends after 5 minutes or 45 s without input.
- Estimated wait uses the average of the last 20 finished turns (needs ≥ 3).

### Socket events

Client → server: `queue:join`, `queue:leave`, `game:input`, `game:ready`, `level:submit`, `level:vote`
Server → client: `queue:updated`, `game:player-changed`, `game:started`, `game:state`, `game:level-loaded`,
`game:player-died`, `game:lives-updated`, `game:level-completed`, `game:ended`

## Levels

Levels are JSON (`LevelData`): solids, spikes, pits, hidden traps, moving platforms, falling platforms, fake doors, spawn and exit.

- **Procedural:** `generateLevel(seed, number)` is deterministic. Difficulty ramps with the level number. Every level is accepted
  only after structural validation **and** the solver finds a real input sequence that reaches the exit; otherwise it re-rolls
  (falls back to a flat level).
- **Community:** build levels in `/editor` (tile grid, drag-paint, undo/redo, clear, test, validate, submit, draft autosave).
  The server re-validates every submission with the same pipeline before it enters the playable pool. Rejected
  submissions are stored with a reason. Submissions are rate limited; guests cannot submit or vote.
- **Voting & moderation:** upvote/downvote + 1–5 difficulty rating (not on your own level). Heavily down-voted levels are
  hidden automatically. Completions and deaths per level are tracked.

## Production notes

- Use `npm run build && npm start` on a host that runs a persistent Node process (Fly.io, Railway, Render, a VPS, ...).
- Set a strong `AUTH_SECRET`, and `REDIS_URL` if you want the queue to survive restarts.
- Run `npx drizzle-kit push` (or `migrate`) against the production database before first start.
- Health check: `GET /api/health`.

## Extending

New mechanics = a new field in `LevelData` + `levelSchema`, handling in `Sim` (physics/hazard rules), a renderer in
`GameScene`, an editor tool in `editorOps.ts`, and a generator segment. The solver automatically takes new physics into account.
