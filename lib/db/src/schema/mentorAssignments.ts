import { pgTable, text, uuid, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { organizations } from "./organizations";
import { courses } from "./courses";
import { learningPaths } from "./learningPaths";

export const mentorAssignments = pgTable("mentor_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  mentorUserId: text("mentor_user_id").notNull().references(() => users.id),
  learnerUserId: text("learner_user_id").notNull().references(() => users.id),
  courseId: uuid("course_id").references(() => courses.id),
  learningPathId: uuid("learning_path_id").references(() => learningPaths.id),
  assignedBy: text("assigned_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("mentor_assignments_org_idx").on(table.organizationId),
  index("mentor_assignments_learner_idx").on(table.learnerUserId),
  index("mentor_assignments_mentor_idx").on(table.mentorUserId),
]);

export type MentorAssignment = typeof mentorAssignments.$inferSelect;
