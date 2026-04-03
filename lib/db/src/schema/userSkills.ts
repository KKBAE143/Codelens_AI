import { pgTable, text, uuid, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { courses } from "./courses";

export const userSkills = pgTable("user_skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id),
  skill: text("skill").notNull(),
  acquiredFromCourseId: uuid("acquired_from_course_id").references(() => courses.id),
  acquiredAt: timestamp("acquired_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_skill_unique").on(table.userId, table.skill),
  index("user_skills_user_idx").on(table.userId),
]);

export type UserSkill = typeof userSkills.$inferSelect;
