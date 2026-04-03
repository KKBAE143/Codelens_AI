import { pgTable, text, uuid, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { courses } from "./courses";

export const userXpEvents = pgTable("user_xp_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
  eventType: text("event_type", {
    enum: ["module_read", "quiz_pass", "flashcard_session", "course_complete"],
  }).notNull(),
  moduleIndex: integer("module_index"),
  points: integer("points").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("user_xp_events_user_id_idx").on(table.userId),
  index("user_xp_events_created_at_idx").on(table.createdAt),
  uniqueIndex("user_xp_quiz_pass_unique_idx")
    .on(table.userId, table.courseId, table.eventType, table.moduleIndex)
    .where(sql`event_type = 'quiz_pass' AND module_index IS NOT NULL`),
]);

export type UserXpEvent = typeof userXpEvents.$inferSelect;
