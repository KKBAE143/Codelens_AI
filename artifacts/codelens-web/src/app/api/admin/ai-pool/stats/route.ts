import { NextResponse } from "next/server";
import { db } from "@workspace/db";
import { aiPoolStats } from "@workspace/db/schema";
import { sql, desc, gte } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { getAllAccountHealths, getPoolAccounts } from "@/lib/llm";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const accountSummaries = await db
      .select({
        accountLabel: aiPoolStats.accountLabel,
        totalRequests: sql<number>`count(*)::int`,
        successCount: sql<number>`count(*) filter (where ${aiPoolStats.success} = true)::int`,
        failCount: sql<number>`count(*) filter (where ${aiPoolStats.success} = false)::int`,
        totalTokens: sql<number>`coalesce(sum(${aiPoolStats.tokensUsed}), 0)::int`,
        avgLatency: sql<number>`coalesce(avg(${aiPoolStats.latencyMs}), 0)::int`,
        lastUsed: sql<string>`max(${aiPoolStats.timestamp})`,
      })
      .from(aiPoolStats)
      .where(gte(aiPoolStats.timestamp, todayStart))
      .groupBy(aiPoolStats.accountLabel);

    const hourlyStats = await db
      .select({
        hour: sql<string>`date_trunc('hour', ${aiPoolStats.timestamp})`,
        accountLabel: aiPoolStats.accountLabel,
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${aiPoolStats.tokensUsed}), 0)::int`,
        successes: sql<number>`count(*) filter (where ${aiPoolStats.success} = true)::int`,
      })
      .from(aiPoolStats)
      .where(gte(aiPoolStats.timestamp, oneDayAgo))
      .groupBy(sql`date_trunc('hour', ${aiPoolStats.timestamp})`, aiPoolStats.accountLabel)
      .orderBy(sql`date_trunc('hour', ${aiPoolStats.timestamp})`);

    const recentErrors = await db
      .select({
        accountLabel: aiPoolStats.accountLabel,
        errorCode: aiPoolStats.errorCode,
        stage: aiPoolStats.stage,
        model: aiPoolStats.model,
        timestamp: aiPoolStats.timestamp,
      })
      .from(aiPoolStats)
      .where(sql`${aiPoolStats.success} = false and ${aiPoolStats.timestamp} >= ${oneDayAgo}`)
      .orderBy(desc(aiPoolStats.timestamp))
      .limit(20);

    const accountHealths = await getAllAccountHealths();

    let accounts;
    try {
      accounts = getPoolAccounts();
    } catch {
      accounts = [];
    }

    const totalRequests = accountSummaries.reduce((s, a) => s + a.totalRequests, 0);
    const totalSuccess = accountSummaries.reduce((s, a) => s + a.successCount, 0);
    const healthyAccounts = accountHealths.filter(a => {
      return a.health.quarantinedUntil === 0 || Date.now() >= a.health.quarantinedUntil;
    }).length;

    let poolHealth: "green" | "yellow" | "red" = "green";
    if (accounts.length === 0) {
      poolHealth = "red";
    } else if (healthyAccounts === 0) {
      poolHealth = "red";
    } else if (healthyAccounts < accounts.length * 0.5) {
      poolHealth = "yellow";
    } else if (totalRequests > 0 && totalSuccess / totalRequests < 0.8) {
      poolHealth = "yellow";
    }

    return NextResponse.json({
      poolHealth,
      totalAccounts: accounts.length,
      healthyAccounts,
      accounts: accountHealths.map(({ account, health }) => {
        const summary = accountSummaries.find(s => s.accountLabel === account.label);
        return {
          label: account.label,
          stages: account.stages || [],
          status: health.quarantinedUntil > 0 && Date.now() < health.quarantinedUntil
            ? "quarantined"
            : "healthy",
          quarantinedUntil: health.quarantinedUntil > Date.now() ? health.quarantinedUntil : null,
          weight: health.weight,
          errorCount: health.errorCount,
          todayTokens: summary?.totalTokens || 0,
          todayRequests: summary?.totalRequests || 0,
          todaySuccesses: summary?.successCount || 0,
          todayFailures: summary?.failCount || 0,
          avgLatency: summary?.avgLatency || 0,
          lastUsed: summary?.lastUsed || null,
        };
      }),
      hourlyStats,
      recentErrors,
    });
  } catch (err) {
    console.error("[Admin] Pool stats error:", err);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
