import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const userStreaks = pgTable("user_streaks", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActiveDate: text("last_active_date"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type UserStreak = typeof userStreaks.$inferSelect;
