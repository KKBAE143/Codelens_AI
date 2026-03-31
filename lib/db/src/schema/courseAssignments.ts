import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { courses } from "./courses";
import { users } from "./users";
import { organizations } from "./organizations";

export const courseAssignments = pgTable("course_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id),
  assignedTo: text("assigned_to").notNull().references(() => users.id),
  assignedBy: text("assigned_by").notNull().references(() => users.id),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  dueDate: timestamp("due_date"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("course_assignments_course_id_idx").on(table.courseId),
  index("course_assignments_assigned_to_idx").on(table.assignedTo),
  index("course_assignments_organization_id_idx").on(table.organizationId),
]);

export const insertCourseAssignmentSchema = createInsertSchema(courseAssignments).omit({
  id: true,
  createdAt: true,
});
export type InsertCourseAssignment = z.infer<typeof insertCourseAssignmentSchema>;
export type CourseAssignment = typeof courseAssignments.$inferSelect;
