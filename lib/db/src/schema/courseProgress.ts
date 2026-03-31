import { pgTable, text, uuid, integer, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { courses } from "./courses";
import { users } from "./users";

export const courseProgress = pgTable("course_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id),
  userId: text("user_id").notNull().references(() => users.id),
  completedModules: jsonb("completed_modules").$type<number[]>().default([]),
  quizAnswers: jsonb("quiz_answers"),
  lastViewedAt: timestamp("last_viewed_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  percentComplete: integer("percent_complete").notNull().default(0),
  lastSeenVersion: integer("last_seen_version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("course_progress_unique").on(table.courseId, table.userId),
]);

export const insertCourseProgressSchema = createInsertSchema(courseProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCourseProgress = z.infer<typeof insertCourseProgressSchema>;
export type CourseProgress = typeof courseProgress.$inferSelect;
