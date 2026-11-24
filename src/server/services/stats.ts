import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { gameEvents, gameSessions, levels, levelVotes, playerStats, queueEntries, users } from "@/db/schema";
import type { EndReason } from "@/shared/types";
import type { Turn } from "../queue/TurnManager";

// Fire-and-forget DB writes are serialized so ordering (join -> start -> end) is preserved.
let chain: Promise<unknown> = Promise.resolve();
function bg(fn: () => Promise<unknown>, label: string) {
  chain = chain.then(fn).catch((e) => console.error(`[db] ${label} failed:`, (e as Error).message));
}

export async function startSession(turn: Turn): Promise<void> {
  await db.insert(gameSessions).values({
    id: turn.turnId,
    userId: turn.userId,
    livesGranted: turn.maxLives,
    queueSizeAtStart: turn.queueSizeAtStart,
  });
  await db
    .update(queueEntries)
    .set({ status: "active", startedAt: new Date(), sessionId: turn.turnId })
    .where(and(eq(queueEntries.userId, turn.userId), eq(queueEntries.status, "waiting")));
}

export async function endSession(turn: Turn, reason: EndReason): Promise<void> {
  const durationMs = Math.max(0, Date.now() - turn.startedAt);
  await db
    .update(gameSessions)
    .set({
      endedAt: new Date(),
      durationMs,
      endReason: reason,
      levelsCompleted: turn.levelsCompleted,
      deaths: turn.deaths,
    })
    .where(eq(gameSessions.id, turn.turnId));
  await db
    .update(queueEntries)
    .set({ status: "completed", leftAt: new Date() })
    .where(and(eq(queueEntries.userId, turn.userId), eq(queueEntries.sessionId, turn.turnId)));
  await db
    .insert(playerStats)
    .values({
      userId: turn.userId,
      gamesPlayed: 1,
      levelsCompleted: turn.levelsCompleted,
      totalDeaths: turn.deaths,
      bestStreak: turn.levelsCompleted,
      totalPlayMs: durationMs,
    })
    .onConflictDoUpdate({
      target: playerStats.userId,
      set: {
        gamesPlayed: sql`${playerStats.gamesPlayed} + 1`,
        levelsCompleted: sql`${playerStats.levelsCompleted} + ${turn.levelsCompleted}`,
        totalDeaths: sql`${playerStats.totalDeaths} + ${turn.deaths}`,
        bestStreak: sql`greatest(${playerStats.bestStreak}, ${turn.levelsCompleted})`,
        totalPlayMs: sql`${playerStats.totalPlayMs} + ${durationMs}`,
        updatedAt: new Date(),
      },
    });
}

export function recordEvent(
  sessionId: string | null,
  userId: string | null,
  type: string,
  payload: Record<string, unknown> = {},
  levelId: string | null = null,
) {
  bg(() => db.insert(gameEvents).values({ sessionId, userId, type, payload, levelId }), "recordEvent");
}

export function bgStartSession(turn: Turn) {
  bg(() => startSession(turn), "startSession");
}
export function bgEndSession(turn: Turn, reason: EndReason) {
  bg(() => endSession(turn, reason), "endSession");
}

export function bumpLevel(levelId: string, field: "plays" | "completions" | "deaths") {
  const col = levels[field];
  bg(() => db.update(levels).set({ [field]: sql`${col} + 1` }).where(eq(levels.id, levelId)), "bumpLevel");
}

export async function queueEntryJoined(userId: string) {
  await db
    .insert(queueEntries)
    .values({ userId, status: "waiting" })
    .onConflictDoNothing();
}
export async function queueEntryLeft(userId: string, status: "left" | "expired" = "left") {
  await db
    .update(queueEntries)
    .set({ status, leftAt: new Date() })
    .where(and(eq(queueEntries.userId, userId), eq(queueEntries.status, "waiting")));
}
export function bgQueueJoined(userId: string) {
  bg(() => queueEntryJoined(userId), "queueEntryJoined");
}
export function bgQueueLeft(userId: string, status: "left" | "expired" = "left") {
  bg(() => queueEntryLeft(userId, status), "queueEntryLeft");
}

/** Average turn duration from recent finished sessions; null when there isn't enough data. */
export async function getAvgTurnMs(): Promise<number | null> {
  const rows = await db
    .select({ d: gameSessions.durationMs })
    .from(gameSessions)
    .where(and(isNotNull(gameSessions.endedAt), isNotNull(gameSessions.durationMs), gte(gameSessions.durationMs, 5000)))
    .orderBy(desc(gameSessions.endedAt))
    .limit(20);
  if (rows.length < 3) return null;
  return Math.round(rows.reduce((s, r) => s + (r.d ?? 0), 0) / rows.length);
}

export async function getLeaderboards(limit = 10) {
  const base = {
    username: users.username,
    levelsCompleted: playerStats.levelsCompleted,
    totalDeaths: playerStats.totalDeaths,
    bestStreak: playerStats.bestStreak,
    gamesPlayed: playerStats.gamesPlayed,
  };
  const topPlayers = await db
    .select(base)
    .from(playerStats)
    .innerJoin(users, eq(users.id, playerStats.userId))
    .where(gte(playerStats.levelsCompleted, 1))
    .orderBy(desc(playerStats.levelsCompleted), playerStats.totalDeaths)
    .limit(limit);
  const fewestDeaths = await db
    .select({
      ...base,
      deathsPerLevel: sql<number>`round(${playerStats.totalDeaths}::numeric / nullif(${playerStats.levelsCompleted}, 0), 2)::float`,
    })
    .from(playerStats)
    .innerJoin(users, eq(users.id, playerStats.userId))
    .where(gte(playerStats.levelsCompleted, 3))
    .orderBy(sql`${playerStats.totalDeaths}::numeric / nullif(${playerStats.levelsCompleted}, 0)`)
    .limit(limit);
  const bestStreak = await db
    .select(base)
    .from(playerStats)
    .innerJoin(users, eq(users.id, playerStats.userId))
    .where(gte(playerStats.bestStreak, 1))
    .orderBy(desc(playerStats.bestStreak))
    .limit(limit);
  const creators = await db
    .select({
      username: users.username,
      levelsCreated: sql<number>`count(${levels.id})::int`,
      upvotes: sql<number>`coalesce(sum(${levels.upvotes}), 0)::int`,
      completions: sql<number>`coalesce(sum(${levels.completions}), 0)::int`,
    })
    .from(levels)
    .innerJoin(users, eq(users.id, levels.creatorId))
    .where(and(eq(levels.status, "approved"), eq(levels.source, "community")))
    .groupBy(users.username)
    .orderBy(desc(sql`coalesce(sum(${levels.upvotes}), 0)`), desc(sql`count(${levels.id})`))
    .limit(limit);
  return { topPlayers, fewestDeaths, bestStreak, creators };
}

export async function getProfile(username: string, viewerId: string | null) {
  const [u] = await db.select().from(users).where(eq(users.usernameLower, username.toLowerCase())).limit(1);
  if (!u) return null;
  const [stats] = await db.select().from(playerStats).where(eq(playerStats.userId, u.id)).limit(1);
  const created = await db
    .select({
      id: levels.id,
      name: levels.name,
      status: levels.status,
      rejectionReason: levels.rejectionReason,
      upvotes: levels.upvotes,
      completions: levels.completions,
      deaths: levels.deaths,
      createdAt: levels.createdAt,
    })
    .from(levels)
    .where(eq(levels.creatorId, u.id))
    .orderBy(desc(levels.createdAt))
    .limit(30);
  const recentSessions = await db
    .select({
      startedAt: gameSessions.startedAt,
      levelsCompleted: gameSessions.levelsCompleted,
      deaths: gameSessions.deaths,
      livesGranted: gameSessions.livesGranted,
      durationMs: gameSessions.durationMs,
      endReason: gameSessions.endReason,
    })
    .from(gameSessions)
    .where(and(eq(gameSessions.userId, u.id), isNotNull(gameSessions.endedAt)))
    .orderBy(desc(gameSessions.startedAt))
    .limit(10);
  const own = viewerId === u.id;
  const votes = own
    ? await db
        .select({
          levelId: levelVotes.levelId,
          levelName: levels.name,
          vote: levelVotes.vote,
          difficultyRating: levelVotes.difficultyRating,
          updatedAt: levelVotes.updatedAt,
        })
        .from(levelVotes)
        .innerJoin(levels, eq(levels.id, levelVotes.levelId))
        .where(eq(levelVotes.userId, u.id))
        .orderBy(desc(levelVotes.updatedAt))
        .limit(30)
    : null;
  return {
    username: u.username,
    isGuest: u.isGuest,
    joinedAt: u.createdAt,
    stats: stats ?? {
      gamesPlayed: 0,
      levelsCompleted: 0,
      totalDeaths: 0,
      bestStreak: 0,
      levelsCreated: 0,
      totalPlayMs: 0,
    },
    created: own ? created : created.filter((c) => c.status === "approved"),
    recentSessions,
    votes,
    own,
  };
}
