import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";

export const generationCache = pgTable("generation_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoUrl: text("repo_url").notNull(),
  configHash: text("config_hash").notNull(),
  courseId: uuid("course_id").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type GenerationCacheEntry = typeof generationCache.$inferSelect;
