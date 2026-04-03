import { pgTable, text, uuid, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const orgRequiredSkills = pgTable("org_required_skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  skill: text("skill").notNull(),
  roleLabel: text("role_label"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("org_required_skill_unique").on(table.organizationId, table.skill),
]);

export type OrgRequiredSkill = typeof orgRequiredSkills.$inferSelect;
