import { pgTable, text, uuid, boolean, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
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
  changesSince: jsonb("changes_since").$type<{
    summary: string;
    changedFiles: string[];
    addedFiles: string[];
    modifiedFiles: string[];
    removedFiles: string[];
    previousVersionId: string;
    detectedAt: string;
  }>(),
  errorMessage: text("error_message"),
  version: integer("version").notNull().default(1),
  parentCourseId: uuid("parent_course_id"),
  createdBy: text("created_by").references(() => users.id),
  organizationId: uuid("organization_id").references(() => organizations.id),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCourseSchema = createInsertSchema(courses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof courses.$inferSelect;
