import { pgTable, text, uuid, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

export const userBadges = pgTable("user_badges", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  badgeKey: text("badge_key").notNull(),
  awardedAt: timestamp("awarded_at").notNull().defaultNow(),
}, (table) => [
  index("user_badges_user_id_idx").on(table.userId),
  uniqueIndex("user_badges_user_badge_key_idx").on(table.userId, table.badgeKey),
]);

export type UserBadge = typeof userBadges.$inferSelect;
