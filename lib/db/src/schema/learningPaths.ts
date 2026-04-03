import { pgTable, text, uuid, integer, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { organizations } from "./organizations";
import { courses } from "./courses";

export const learningPaths = pgTable("learning_paths", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("learning_paths_org_idx").on(table.organizationId),
]);

export const learningPathCourses = pgTable("learning_path_courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  learningPathId: uuid("learning_path_id").notNull().references(() => learningPaths.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").notNull().references(() => courses.id),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("lp_course_unique").on(table.learningPathId, table.courseId),
  index("lp_courses_path_idx").on(table.learningPathId),
]);

export const learningPathAssignments = pgTable("learning_path_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  learningPathId: uuid("learning_path_id").notNull().references(() => learningPaths.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  assignedBy: text("assigned_by").notNull().references(() => users.id),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("lp_assignment_unique").on(table.learningPathId, table.userId),
  index("lp_assignments_user_idx").on(table.userId),
]);

export type LearningPath = typeof learningPaths.$inferSelect;
export type LearningPathCourse = typeof learningPathCourses.$inferSelect;
export type LearningPathAssignment = typeof learningPathAssignments.$inferSelect;
