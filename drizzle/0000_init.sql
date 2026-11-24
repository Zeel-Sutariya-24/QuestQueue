CREATE TABLE "game_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" uuid,
	"user_id" uuid,
	"type" varchar(32) NOT NULL,
	"level_id" uuid,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"lives_granted" integer NOT NULL,
	"queue_size_at_start" integer DEFAULT 0 NOT NULL,
	"levels_completed" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"end_reason" varchar(24),
	CONSTRAINT "game_sessions_lives_chk" CHECK ("game_sessions"."lives_granted" in (5, 10))
);
--> statement-breakpoint
CREATE TABLE "level_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"level_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"vote" smallint,
	"difficulty_rating" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "level_votes_vote_chk" CHECK ("level_votes"."vote" is null or "level_votes"."vote" in (-1, 1)),
	CONSTRAINT "level_votes_rating_chk" CHECK ("level_votes"."difficulty_rating" is null or "level_votes"."difficulty_rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(40) NOT NULL,
	"creator_id" uuid,
	"data" jsonb NOT NULL,
	"source" varchar(16) DEFAULT 'community' NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"difficulty" smallint DEFAULT 1 NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"downvotes" integer DEFAULT 0 NOT NULL,
	"difficulty_votes" integer DEFAULT 0 NOT NULL,
	"difficulty_sum" integer DEFAULT 0 NOT NULL,
	"plays" integer DEFAULT 0 NOT NULL,
	"completions" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"solve_frames" integer,
	"width" integer DEFAULT 60 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "levels_status_chk" CHECK ("levels"."status" in ('pending','approved','rejected','hidden')),
	CONSTRAINT "levels_source_chk" CHECK ("levels"."source" in ('community','seed')),
	CONSTRAINT "levels_difficulty_chk" CHECK ("levels"."difficulty" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "player_stats" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"levels_completed" integer DEFAULT 0 NOT NULL,
	"total_deaths" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"levels_created" integer DEFAULT 0 NOT NULL,
	"total_play_ms" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"status" varchar(16) DEFAULT 'waiting' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	CONSTRAINT "queue_entries_status_chk" CHECK ("queue_entries"."status" in ('waiting','active','completed','left','expired'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(24) NOT NULL,
	"username_lower" varchar(24) NOT NULL,
	"password_hash" text NOT NULL,
	"is_guest" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_votes" ADD CONSTRAINT "level_votes_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_votes" ADD CONSTRAINT "level_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "levels" ADD CONSTRAINT "levels_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_events_session_idx" ON "game_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "game_events_type_created_idx" ON "game_events" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "game_sessions_user_idx" ON "game_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "game_sessions_ended_idx" ON "game_sessions" USING btree ("ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX "level_votes_level_user_uq" ON "level_votes" USING btree ("level_id","user_id");--> statement-breakpoint
CREATE INDEX "level_votes_user_idx" ON "level_votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "levels_status_idx" ON "levels" USING btree ("status");--> statement-breakpoint
CREATE INDEX "levels_creator_idx" ON "levels" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "levels_created_idx" ON "levels" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "player_stats_completed_idx" ON "player_stats" USING btree ("levels_completed");--> statement-breakpoint
CREATE INDEX "player_stats_streak_idx" ON "player_stats" USING btree ("best_streak");--> statement-breakpoint
CREATE INDEX "queue_entries_user_idx" ON "queue_entries" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "queue_entries_one_waiting_uq" ON "queue_entries" USING btree ("user_id") WHERE "queue_entries"."status" = 'waiting';--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_uq" ON "users" USING btree ("username_lower");