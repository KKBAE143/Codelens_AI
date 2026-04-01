import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { courses } from "./courses";

export const courseViews = pgTable("course_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id),
  visitorId: text("visitor_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("course_views_course_id_idx").on(table.courseId),
  index("course_views_dedup_idx").on(table.courseId, table.visitorId, table.createdAt),
]);

export type CourseView = typeof courseViews.$inferSelect;
