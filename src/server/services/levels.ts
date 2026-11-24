import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { levels, levelVotes, playerStats, users } from "@/db/schema";
import { generateValidatedLevel } from "@/shared/generator";
import { validateLevel, validateLevelAsync } from "@/shared/validate";
import type { LevelData } from "@/shared/types";
import { RateLimiter } from "../rateLimit";
import type { AuthUser } from "./auth";
import crypto from "node:crypto";

const submitLimiter = new RateLimiter(6, 3600_000);
const BANNED = ["fuck", "shit", "nigg", "cunt", "rape", "nazi"];

export const submitSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters").max(40),
  data: z.unknown(),
});

export const voteSchema = z.object({
  levelId: z.string().uuid(),
  vote: z.union([z.literal(1), z.literal(-1), z.literal(0)]).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
});

export interface SubmitResult {
  ok: boolean;
  id?: string;
  status?: string;
  errors?: string[];
  difficulty?: number;
}

export async function submitLevel(user: AuthUser, input: unknown): Promise<SubmitResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: [parsed.error.issues[0].message] };
  if (user.isGuest) return { ok: false, errors: ["Create a free account to submit levels."] };
  if (!submitLimiter.allow(user.id)) return { ok: false, errors: ["Too many submissions. Try again later."] };
  const { name } = parsed.data;
  const lowered = name.toLowerCase();
  if (BANNED.some((b) => lowered.includes(b))) return { ok: false, errors: ["Please choose a different level name."] };

  const res = await validateLevelAsync(parsed.data.data, { maxNodes: 120000 });
  if (!res.ok || !res.level) {
    await db.insert(levels).values({
      name,
      creatorId: user.id,
      data: (res.level ?? {}) as LevelData,
      status: "rejected",
      rejectionReason: res.errors.join(" ").slice(0, 500),
      width: res.level?.width ?? 0,
    });
    return { ok: false, errors: res.errors };
  }
  const [row] = await db
    .insert(levels)
    .values({
      name,
      creatorId: user.id,
      data: res.level,
      source: "community",
      status: "approved",
      difficulty: res.difficulty ?? 1,
      solveFrames: res.frames,
      width: res.level.width,
    })
    .returning({ id: levels.id });
  await db
    .insert(playerStats)
    .values({ userId: user.id, levelsCreated: 1 })
    .onConflictDoUpdate({
      target: playerStats.userId,
      set: { levelsCreated: sql`${playerStats.levelsCreated} + 1`, updatedAt: new Date() },
    });
  return { ok: true, id: row.id, status: "approved", difficulty: res.difficulty };
}

export type LevelSort = "top" | "new" | "easy" | "hard" | "played";

export async function listLevels(opts: { sort?: LevelSort; limit?: number; viewerId?: string | null; creator?: string }) {
  const order = {
    top: [desc(levels.upvotes), desc(levels.createdAt)],
    new: [desc(levels.createdAt)],
    easy: [levels.difficulty, desc(levels.upvotes)],
    hard: [desc(levels.difficulty), desc(levels.upvotes)],
    played: [desc(levels.plays), desc(levels.upvotes)],
  }[opts.sort ?? "top"];
  const rows = await db
    .select({
      id: levels.id,
      name: levels.name,
      creator: users.username,
      data: levels.data,
      source: levels.source,
      difficulty: levels.difficulty,
      upvotes: levels.upvotes,
      downvotes: levels.downvotes,
      difficultyVotes: levels.difficultyVotes,
      difficultySum: levels.difficultySum,
      plays: levels.plays,
      completions: levels.completions,
      deaths: levels.deaths,
      width: levels.width,
      createdAt: levels.createdAt,
    })
    .from(levels)
    .leftJoin(users, eq(users.id, levels.creatorId))
    .where(eq(levels.status, "approved"))
    .orderBy(...order)
    .limit(Math.min(opts.limit ?? 24, 60));

  let mine = new Map<string, { vote: number | null; rating: number | null }>();
  if (opts.viewerId) {
    const mv = await db.select().from(levelVotes).where(eq(levelVotes.userId, opts.viewerId));
    mine = new Map(mv.map((v) => [v.levelId, { vote: v.vote, rating: v.difficultyRating }]));
  }
  return rows.map((r) => {
    const attempts = r.completions + r.deaths;
    return {
      id: r.id,
      name: r.name,
      creator: r.creator ?? "PixelBot",
      data: r.data as LevelData,
      source: r.source,
      difficulty: r.difficultyVotes >= 3 ? Math.round(r.difficultySum / r.difficultyVotes) : r.difficulty,
      upvotes: r.upvotes,
      downvotes: r.downvotes,
      plays: r.plays,
      completions: r.completions,
      deaths: r.deaths,
      completionRate: attempts > 0 ? Math.round((r.completions / attempts) * 100) : null,
      width: r.width,
      createdAt: r.createdAt,
      myVote: mine.get(r.id)?.vote ?? 0,
      myRating: mine.get(r.id)?.rating ?? null,
    };
  });
}

export async function getLevel(id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const [r] = await db
    .select({ id: levels.id, name: levels.name, data: levels.data, status: levels.status, creator: users.username })
    .from(levels)
    .leftJoin(users, eq(users.id, levels.creatorId))
    .where(eq(levels.id, id))
    .limit(1);
  if (!r || r.status !== "approved") return null;
  return { id: r.id, name: r.name, creator: r.creator ?? "PixelBot", data: r.data as LevelData };
}

export async function voteOnLevel(user: AuthUser, input: unknown) {
  const parsed = voteSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid vote" };
  if (user.isGuest) return { ok: false as const, error: "Create a free account to vote." };
  const { levelId, vote, difficulty } = parsed.data;
  const [lvl] = await db.select().from(levels).where(eq(levels.id, levelId)).limit(1);
  if (!lvl || lvl.status === "rejected") return { ok: false as const, error: "Level not found" };
  if (lvl.creatorId === user.id) return { ok: false as const, error: "You cannot vote on your own level." };

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(levelVotes)
      .where(and(eq(levelVotes.levelId, levelId), eq(levelVotes.userId, user.id)))
      .limit(1);
    const newVote = vote === undefined ? (existing?.vote ?? null) : vote === 0 ? null : vote;
    const newRating = difficulty ?? existing?.difficultyRating ?? null;
    if (existing) {
      await tx
        .update(levelVotes)
        .set({ vote: newVote, difficultyRating: newRating, updatedAt: new Date() })
        .where(eq(levelVotes.id, existing.id));
    } else {
      await tx.insert(levelVotes).values({ levelId, userId: user.id, vote: newVote, difficultyRating: newRating });
    }
    const [agg] = await tx
      .select({
        up: sql<number>`count(*) filter (where ${levelVotes.vote} = 1)::int`,
        down: sql<number>`count(*) filter (where ${levelVotes.vote} = -1)::int`,
        dv: sql<number>`count(${levelVotes.difficultyRating})::int`,
        ds: sql<number>`coalesce(sum(${levelVotes.difficultyRating}), 0)::int`,
      })
      .from(levelVotes)
      .where(eq(levelVotes.levelId, levelId));
    // Moderation: heavily down-voted levels are hidden from the playable pool
    const hide = agg.down >= 5 && agg.down > agg.up * 2;
    await tx
      .update(levels)
      .set({
        upvotes: agg.up,
        downvotes: agg.down,
        difficultyVotes: agg.dv,
        difficultySum: agg.ds,
        status: hide ? "hidden" : lvl.status,
      })
      .where(eq(levels.id, levelId));
  });
  const [after] = await db.select().from(levels).where(eq(levels.id, levelId)).limit(1);
  return { ok: true as const, upvotes: after.upvotes, downvotes: after.downvotes };
}

export interface PoolLevel {
  id: string;
  name: string;
  creator: string;
  data: LevelData;
  difficulty: number;
  source: "community" | "seed";
}

export async function loadPlayablePool(): Promise<PoolLevel[]> {
  const rows = await db
    .select({
      id: levels.id,
      name: levels.name,
      data: levels.data,
      difficulty: levels.difficulty,
      source: levels.source,
      creator: users.username,
    })
    .from(levels)
    .leftJoin(users, eq(users.id, levels.creatorId))
    .where(eq(levels.status, "approved"))
    .orderBy(desc(levels.upvotes))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    creator: r.creator ?? "PixelBot",
    data: r.data as LevelData,
    difficulty: r.difficulty,
    source: r.source as "community" | "seed",
  }));
}

const SEED_NAMES = [
  "Sunrise Stroll",
  "Spike Meadow",
  "Hop & Drop",
  "Trapdoor Alley",
  "Elevator Pitch",
  "Crumbling Bridge",
  "Fake Exit Frenzy",
  "The Gauntlet",
];

/** Seed data: a handful of generated + physics-verified levels owned by "PixelBot". */
export async function ensureSeedLevels(): Promise<void> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(levels)
    .where(eq(levels.source, "seed"));
  if (n > 0) return;
  let [bot] = await db.select().from(users).where(eq(users.usernameLower, "pixelbot")).limit(1);
  if (!bot) {
    [bot] = await db
      .insert(users)
      .values({
        username: "PixelBot",
        usernameLower: "pixelbot",
        passwordHash: "disabled$" + crypto.randomBytes(8).toString("hex"),
        isGuest: false,
      })
      .returning();
    await db.insert(playerStats).values({ userId: bot.id }).onConflictDoNothing();
  }
  const numbers = [1, 2, 3, 4, 6, 8, 10, 12];
  for (let i = 0; i < numbers.length; i++) {
    const g = generateValidatedLevel(numbers[i], 9000 + i * 17);
    const res = validateLevel(g.level, { maxNodes: 60000 });
    if (!res.ok) continue;
    await db.insert(levels).values({
      name: SEED_NAMES[i],
      creatorId: bot.id,
      data: g.level,
      source: "seed",
      status: "approved",
      difficulty: res.difficulty ?? 1,
      solveFrames: res.frames,
      width: g.level.width,
    });
  }
  console.log("[seed] inserted starter levels");
}
