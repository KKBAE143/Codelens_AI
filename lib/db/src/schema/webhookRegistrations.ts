import { pgTable, text, uuid, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { courses } from "./courses";

export const webhookRegistrations = pgTable("webhook_registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id),
  githubRepoFullName: text("github_repo_full_name").notNull(),
  webhookId: text("webhook_id").notNull(),
  webhookSecret: text("webhook_secret").notNull(),
  autoRegenerate: boolean("auto_regenerate").notNull().default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWebhookRegistrationSchema = createInsertSchema(webhookRegistrations).omit({
  id: true,
  createdAt: true,
});
export type InsertWebhookRegistration = z.infer<typeof insertWebhookRegistrationSchema>;
export type WebhookRegistration = typeof webhookRegistrations.$inferSelect;
