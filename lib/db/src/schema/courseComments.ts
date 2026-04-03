import { pgTable, text, uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { courses } from "./courses";
import { users } from "./users";

export const courseComments = pgTable("course_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  moduleIndex: integer("module_index").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  userName: text("user_name").notNull(),
  userAvatar: text("user_avatar"),
  content: text("content").notNull(),
  parentId: uuid("parent_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type CourseComment = typeof courseComments.$inferSelect;
