CREATE TABLE "user_badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"badge_key" text NOT NULL,
	"awarded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"module_index" integer NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"user_avatar" text,
	"content" text NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_pool_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_label" text NOT NULL,
	"stage" text NOT NULL,
	"model" text NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"success" boolean NOT NULL,
	"error_code" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" text DEFAULT 'UTC';--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "commit_sha" text;--> statement-breakpoint
ALTER TABLE "flashcards" ADD COLUMN "hint" text;--> statement-breakpoint
ALTER TABLE "user_xp_events" ADD COLUMN "module_index" integer;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD COLUMN "streak_shield_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD COLUMN "streak_shield_used_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_comments" ADD CONSTRAINT "course_comments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_comments" ADD CONSTRAINT "course_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_badges_user_id_idx" ON "user_badges" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_badges_user_badge_key_idx" ON "user_badges" USING btree ("user_id","badge_key");--> statement-breakpoint
CREATE INDEX "ai_pool_stats_account_label_idx" ON "ai_pool_stats" USING btree ("account_label");--> statement-breakpoint
CREATE INDEX "ai_pool_stats_timestamp_idx" ON "ai_pool_stats" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "ai_pool_stats_stage_idx" ON "ai_pool_stats" USING btree ("stage");--> statement-breakpoint
CREATE UNIQUE INDEX "user_xp_quiz_pass_unique_idx" ON "user_xp_events" USING btree ("user_id","course_id","event_type","module_index") WHERE event_type = 'quiz_pass' AND module_index IS NOT NULL;