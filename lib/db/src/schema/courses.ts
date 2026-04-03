import { pgTable, text, uuid, boolean, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { users } from "./users";
import { organizations } from "./organizations";

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").unique(),
  githubUrl: text("github_url").notNull(),
  repoName: text("repo_name").notNull(),
  ownerName: text("owner_name").notNull(),
  defaultBranch: text("default_branch").default("main"),
  isPrivate: boolean("is_private").notNull().default(false),
  targetAudience: text("target_audience", {
    enum: ["vibe_coder", "new_engineer", "product_manager", "security_auditor"],
  }).notNull().default("new_engineer"),
  status: text("status", {
    enum: ["pending", "generating", "completed", "failed"],
  }).notNull().default("pending"),
  generationJobId: text("generation_job_id"),
  progress: jsonb("progress").$type<{ stage: string; detail: string; percent: number }>(),
  analysis: jsonb("analysis"),
  curriculum: jsonb("curriculum"),
  html: text("html"),
  techStack: jsonb("tech_stack").$type<{
    languages: string[];
    frameworks: string[];
    databases: string[];
    keyLibraries: string[];
  }>(),
  oneLiner: text("one_liner"),
  difficulty: text("difficulty"),
  estimatedMinutes: integer("estimated_minutes"),
  moduleCount: integer("module_count"),
  isPublic: boolean("is_public").notNull().default(true),
  shareToken: text("share_token").unique(),
  pipelineState: jsonb("pipeline_state").$type<{
    stage: string;
    abstractions?: unknown;
    relationships?: unknown;
    curriculum?: unknown;
    chaptersProgress?: unknown[];
    completedChapterIndices?: number[];
  }>(),
  sourceFileHashes: jsonb("source_file_hashes").$type<Record<string, string>>(),
  configHash: text("config_hash"),
  depthPreset: text("depth_preset", { enum: ["quick", "full", "deep"] }),
  focusAreas: jsonb("focus_areas").$type<string[]>(),
  customContext: text("custom_context"),
  changesSince: jsonb("changes_since").$type<{
    summary: string;
    changedFiles: string[];
    addedFiles: string[];
    modifiedFiles: string[];
    removedFiles: string[];
    previousVersionId: string;
    detectedAt: string;
  }>(),
  skillTags: jsonb("skill_tags").$type<string[]>(),
  errorMessage: text("error_message"),
  stars: integer("stars"),
  viewCount: integer("view_count").notNull().default(0),
  version: integer("version").notNull().default(1),
  parentCourseId: uuid("parent_course_id"),
  createdBy: text("created_by").references(() => users.id),
  organizationId: uuid("organization_id").references(() => organizations.id),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("courses_created_by_idx").on(table.createdBy),
  index("courses_organization_id_idx").on(table.organizationId),
  index("courses_created_at_idx").on(table.createdAt),
  index("courses_status_idx").on(table.status),
  index("courses_explore_idx").on(table.isPublic, table.isPrivate, table.deletedAt, table.status),
]);

export const insertCourseSchema = createInsertSchema(courses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof courses.$inferSelect;
