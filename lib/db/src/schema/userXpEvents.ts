import { pgTable, text, uuid, integer, timestamp, index } from "drizzle-orm/pg-core";
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
]);

export type UserXpEvent = typeof userXpEvents.$inferSelect;
