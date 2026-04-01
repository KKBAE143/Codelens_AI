import { pgTable, text, uuid, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { courses } from "./courses";
import { users } from "./users";

export const moduleQuizScores = pgTable("module_quiz_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  moduleIndex: integer("module_index").notNull(),
  score: integer("score").notNull().default(0),
  questionsTotal: integer("questions_total").notNull().default(0),
  questionsCorrect: integer("questions_correct").notNull().default(0),
  completedAt: timestamp("completed_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("module_quiz_scores_unique").on(table.courseId, table.userId, table.moduleIndex),
]);

export type ModuleQuizScore = typeof moduleQuizScores.$inferSelect;
