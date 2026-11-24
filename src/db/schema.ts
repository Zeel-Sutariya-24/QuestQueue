import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: varchar("username", { length: 24 }).notNull(),
    usernameLower: varchar("username_lower", { length: 24 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    isGuest: boolean("is_guest").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_username_lower_uq").on(t.usernameLower)],
);

export const playerStats = pgTable(
  "player_stats",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    gamesPlayed: integer("games_played").notNull().default(0),
    levelsCompleted: integer("levels_completed").notNull().default(0),
    totalDeaths: integer("total_deaths").notNull().default(0),
    bestStreak: integer("best_streak").notNull().default(0),
    levelsCreated: integer("levels_created").notNull().default(0),
    totalPlayMs: integer("total_play_ms").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("player_stats_completed_idx").on(t.levelsCompleted),
    index("player_stats_streak_idx").on(t.bestStreak),
  ],
);

export const levels = pgTable(
  "levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 40 }).notNull(),
    creatorId: uuid("creator_id").references(() => users.id, { onDelete: "set null" }),
    data: jsonb("data").notNull(),
    source: varchar("source", { length: 16 }).notNull().default("community"),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    rejectionReason: text("rejection_reason"),
    difficulty: smallint("difficulty").notNull().default(1),
    upvotes: integer("upvotes").notNull().default(0),
    downvotes: integer("downvotes").notNull().default(0),
    difficultyVotes: integer("difficulty_votes").notNull().default(0),
    difficultySum: integer("difficulty_sum").notNull().default(0),
    plays: integer("plays").notNull().default(0),
    completions: integer("completions").notNull().default(0),
    deaths: integer("deaths").notNull().default(0),
    solveFrames: integer("solve_frames"),
    width: integer("width").notNull().default(60),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("levels_status_idx").on(t.status),
    index("levels_creator_idx").on(t.creatorId),
    index("levels_created_idx").on(t.createdAt),
    check("levels_status_chk", sql`${t.status} in ('pending','approved','rejected','hidden')`),
    check("levels_source_chk", sql`${t.source} in ('community','seed')`),
    check("levels_difficulty_chk", sql`${t.difficulty} between 1 and 5`),
  ],
);

export const levelVotes = pgTable(
  "level_votes",
  {
    id: serial("id").primaryKey(),
    levelId: uuid("level_id")
      .notNull()
      .references(() => levels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vote: smallint("vote"),
    difficultyRating: smallint("difficulty_rating"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("level_votes_level_user_uq").on(t.levelId, t.userId),
    index("level_votes_user_idx").on(t.userId),
    check("level_votes_vote_chk", sql`${t.vote} is null or ${t.vote} in (-1, 1)`),
    check(
      "level_votes_rating_chk",
      sql`${t.difficultyRating} is null or ${t.difficultyRating} between 1 and 5`,
    ),
  ],
);

export const gameSessions = pgTable(
  "game_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    livesGranted: integer("lives_granted").notNull(),
    queueSizeAtStart: integer("queue_size_at_start").notNull().default(0),
    levelsCompleted: integer("levels_completed").notNull().default(0),
    deaths: integer("deaths").notNull().default(0),
    durationMs: integer("duration_ms"),
    endReason: varchar("end_reason", { length: 24 }),
  },
  (t) => [
    index("game_sessions_user_idx").on(t.userId),
    index("game_sessions_ended_idx").on(t.endedAt),
    check("game_sessions_lives_chk", sql`${t.livesGranted} in (5, 10)`),
  ],
);

export const queueEntries = pgTable(
  "queue_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => gameSessions.id, { onDelete: "set null" }),
    status: varchar("status", { length: 16 }).notNull().default("waiting"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [
    index("queue_entries_user_idx").on(t.userId),
    // an account can only have ONE waiting entry at a time
    uniqueIndex("queue_entries_one_waiting_uq").on(t.userId).where(sql`${t.status} = 'waiting'`),
    check(
      "queue_entries_status_chk",
      sql`${t.status} in ('waiting','active','completed','left','expired')`,
    ),
  ],
);

export const gameEvents = pgTable(
  "game_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sessionId: uuid("session_id").references(() => gameSessions.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    type: varchar("type", { length: 32 }).notNull(),
    levelId: uuid("level_id"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("game_events_session_idx").on(t.sessionId),
    index("game_events_type_created_idx").on(t.type, t.createdAt),
  ],
);
