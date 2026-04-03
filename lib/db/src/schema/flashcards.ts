import { pgTable, text, uuid, integer, timestamp, real, uniqueIndex } from "drizzle-orm/pg-core";
import { courses } from "./courses";
import { users } from "./users";

export const flashcards = pgTable("flashcards", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  moduleIndex: integer("module_index").notNull(),
  front: text("front").notNull(),
  back: text("back").notNull(),
  hint: text("hint"),
  codeSnippet: text("code_snippet"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const flashcardReviews = pgTable("flashcard_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  flashcardId: uuid("flashcard_id").notNull().references(() => flashcards.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  due: timestamp("due").notNull().defaultNow(),
  stability: real("stability").notNull().default(0),
  difficulty: real("difficulty").notNull().default(0),
  elapsedDays: integer("elapsed_days").notNull().default(0),
  scheduledDays: integer("scheduled_days").notNull().default(0),
  reps: integer("reps").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  state: integer("state").notNull().default(0),
  lastReview: timestamp("last_review"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("flashcard_reviews_unique").on(table.flashcardId, table.userId),
]);

export type Flashcard = typeof flashcards.$inferSelect;
export type FlashcardReview = typeof flashcardReviews.$inferSelect;
