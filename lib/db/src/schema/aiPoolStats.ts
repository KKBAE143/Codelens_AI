import { pgTable, text, uuid, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const aiPoolStats = pgTable("ai_pool_stats", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountLabel: text("account_label").notNull(),
  stage: text("stage").notNull(),
  model: text("model").notNull(),
  tokensUsed: integer("tokens_used").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  success: boolean("success").notNull(),
  errorCode: text("error_code"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => [
  index("ai_pool_stats_account_label_idx").on(table.accountLabel),
  index("ai_pool_stats_timestamp_idx").on(table.timestamp),
  index("ai_pool_stats_stage_idx").on(table.stage),
]);

export type AiPoolStat = typeof aiPoolStats.$inferSelect;
