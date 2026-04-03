"use client";

import { useEffect, useState, useCallback } from "react";

interface AccountInfo {
  label: string;
  stages: string[];
  status: "healthy" | "quarantined";
  quarantinedUntil: number | null;
  weight: number;
  errorCount: number;
  todayTokens: number;
  todayRequests: number;
  todaySuccesses: number;
  todayFailures: number;
  avgLatency: number;
  lastUsed: string | null;
}

interface HourlyStat {
  hour: string;
  accountLabel: string;
  requests: number;
  tokens: number;
  successes: number;
}

interface RecentError {
  accountLabel: string;
  errorCode: string | null;
  stage: string;
  model: string;
  timestamp: string;
}

interface PoolStats {
  poolHealth: "green" | "yellow" | "red";
  totalAccounts: number;
  healthyAccounts: number;
  accounts: AccountInfo[];
  hourlyStats: HourlyStat[];
  recentErrors: RecentError[];
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: "bg-green-100 text-green-800 border-green-200",
    quarantined: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status] || "bg-gray-100 text-gray-800 border-gray-200"}`}>
      {status === "healthy" ? "● Healthy" : "◆ Quarantined"}
    </span>
  );
}

function PoolHealthIndicator({ health }: { health: "green" | "yellow" | "red" }) {
  const config = {
    green: { bg: "bg-green-500", label: "All Systems Go", border: "border-green-200" },
    yellow: { bg: "bg-yellow-500", label: "Degraded", border: "border-yellow-200" },
    red: { bg: "bg-red-500", label: "Critical", border: "border-red-200" },
  };
  const c = config[health];
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${c.border} bg-white`}>
      <div className={`w-3 h-3 rounded-full ${c.bg} animate-pulse`} />
      <span className="text-sm font-medium text-gray-900">Pool Health: {c.label}</span>
    </div>
  );
}

function TokenUsageBar({ used, max }: { used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const color = pct > 80 ? "bg-red-500" : pct > 50 ? "bg-yellow-500" : "bg-blue-500";
  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function HourlyChart({ stats }: { stats: HourlyStat[] }) {
  if (stats.length === 0) return <p className="text-sm text-gray-500">No data yet</p>;

  const hourMap = new Map<string, { requests: number; tokens: number; successes: number }>();
  for (const s of stats) {
    const key = new Date(s.hour).toISOString();
    const existing = hourMap.get(key) || { requests: 0, tokens: 0, successes: 0 };
    existing.requests += s.requests;
    existing.tokens += s.tokens;
    existing.successes += s.successes;
    hourMap.set(key, existing);
  }

  const entries = Array.from(hourMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const maxReqs = Math.max(...entries.map(([, v]) => v.requests), 1);

  return (
    <div className="flex items-end gap-1 h-32">
      {entries.map(([hour, data]) => {
        const height = Math.max(4, (data.requests / maxReqs) * 100);
        const successRate = data.requests > 0 ? data.successes / data.requests : 1;
        const color = successRate > 0.9 ? "bg-blue-500" : successRate > 0.7 ? "bg-yellow-500" : "bg-red-500";
        const label = new Date(hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return (
          <div key={hour} className="flex flex-col items-center flex-1 min-w-0">
            <div
              className={`w-full rounded-t ${color} transition-all`}
              style={{ height: `${height}%` }}
              title={`${label}: ${data.requests} requests, ${formatNumber(data.tokens)} tokens`}
            />
            <span className="text-[9px] text-gray-400 mt-1 truncate w-full text-center">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function AddAccountForm({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [accountId, setAccountId] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [label, setLabel] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string; latencyMs?: number } | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/ai-pool/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, authToken }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, error: "Network error" });
    }
    setTesting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl">
        <h3 className="text-lg font-semibold mb-4">Add Cloudflare Account</h3>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <p className="font-medium mb-1">Setup Instructions:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Go to <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" className="underline">dash.cloudflare.com</a></li>
              <li>Navigate to AI → Workers AI</li>
              <li>Copy your Account ID from the URL or sidebar</li>
              <li>Create an API Token with Workers AI permissions</li>
            </ol>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., production-1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account ID</label>
            <input
              type="text"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="32-character hex string"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Token</label>
            <input
              type="password"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder="Workers AI API token"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {testResult && (
            <div className={`p-3 rounded-lg text-sm ${testResult.success ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
              {testResult.success
                ? `Credentials verified! Response time: ${testResult.latencyMs}ms`
                : `Test failed: ${testResult.error}`}
            </div>
          )}

          {testResult?.success && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              <p className="font-medium">Credentials verified!</p>
              <p className="text-xs mt-1">
                To add this account to the pool, set the <code className="bg-yellow-100 px-1 rounded">CLOUDFLARE_POOL_ACCOUNTS</code> environment variable with this account included in the JSON array, then restart the application.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Close
          </button>
          <button
            onClick={handleTest}
            disabled={!accountId || !authToken || testing}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? "Testing..." : "Test Credentials"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminAiPoolPage() {
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ai-pool/stats");
      if (!res.ok) {
        if (res.status === 401) {
          setError("Admin access required");
          setLoading(false);
          return;
        }
        throw new Error("Failed to fetch stats");
      }
      const data = await res.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading pool stats...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-6 py-4">{error}</div>
      </div>
    );
  }

  if (!stats) return null;

  const maxTokens = Math.max(...stats.accounts.map(a => a.todayTokens), 1);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Account Pool</h1>
            <p className="text-sm text-gray-500 mt-1">
              {stats.totalAccounts} accounts configured, {stats.healthyAccounts} healthy
            </p>
          </div>
          <div className="flex items-center gap-4">
            <PoolHealthIndicator health={stats.poolHealth} />
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + Add Account
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Total Accounts</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{stats.totalAccounts}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Healthy</div>
            <div className="text-2xl font-bold text-green-600 mt-1">{stats.healthyAccounts}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Today&apos;s Requests</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {formatNumber(stats.accounts.reduce((s, a) => s + a.todayRequests, 0))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Today&apos;s Tokens</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {formatNumber(stats.accounts.reduce((s, a) => s + a.todayTokens, 0))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Hourly Request Volume (24h)</h2>
            <HourlyChart stats={stats.hourlyStats} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Error Rate</h2>
            {stats.accounts.length > 0 ? (
              <div className="space-y-3">
                {stats.accounts.filter(a => a.todayRequests > 0).map(account => {
                  const errorRate = account.todayRequests > 0
                    ? ((account.todayFailures / account.todayRequests) * 100).toFixed(1)
                    : "0.0";
                  return (
                    <div key={account.label} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 truncate">{account.label}</span>
                      <span className={`font-mono ${Number(errorRate) > 20 ? "text-red-600" : Number(errorRate) > 5 ? "text-yellow-600" : "text-green-600"}`}>
                        {errorRate}%
                      </span>
                    </div>
                  );
                })}
                {stats.accounts.filter(a => a.todayRequests > 0).length === 0 && (
                  <p className="text-sm text-gray-500">No requests today</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No accounts configured</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700">Account Details</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3 text-left">Account</th>
                  <th className="px-6 py-3 text-left">Status</th>
                  <th className="px-6 py-3 text-left">Stages</th>
                  <th className="px-6 py-3 text-left">Weight</th>
                  <th className="px-6 py-3 text-left">Token Usage</th>
                  <th className="px-6 py-3 text-right">Requests</th>
                  <th className="px-6 py-3 text-right">Avg Latency</th>
                  <th className="px-6 py-3 text-right">Last Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.accounts.map((account) => (
                  <tr key={account.label} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-gray-900">{account.label}</span>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={account.status} />
                      {account.quarantinedUntil && (
                        <span className="block text-xs text-gray-400 mt-1">
                          until {new Date(account.quarantinedUntil).toLocaleTimeString()}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {account.stages.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {account.stages.map(s => (
                            <span key={s} className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">{s}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">all</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono text-gray-700">{account.weight}</span>
                    </td>
                    <td className="px-6 py-4 min-w-[160px]">
                      <TokenUsageBar used={account.todayTokens} max={maxTokens} />
                      <span className="text-xs text-gray-500 mt-1">{formatNumber(account.todayTokens)}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm text-gray-900">{account.todayRequests}</span>
                      {account.todayFailures > 0 && (
                        <span className="text-xs text-red-500 ml-1">({account.todayFailures} failed)</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm text-gray-700">{account.avgLatency > 0 ? `${account.avgLatency}ms` : "—"}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-xs text-gray-500">
                        {account.lastUsed ? new Date(account.lastUsed).toLocaleTimeString() : "Never"}
                      </span>
                    </td>
                  </tr>
                ))}
                {stats.accounts.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                      No accounts configured
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {stats.recentErrors.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700">Recent Errors (24h)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-3 text-left">Time</th>
                    <th className="px-6 py-3 text-left">Account</th>
                    <th className="px-6 py-3 text-left">Stage</th>
                    <th className="px-6 py-3 text-left">Model</th>
                    <th className="px-6 py-3 text-left">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.recentErrors.map((err, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-xs text-gray-500">
                        {new Date(err.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-700">{err.accountLabel}</td>
                      <td className="px-6 py-3 text-sm text-gray-700">{err.stage}</td>
                      <td className="px-6 py-3 text-xs text-gray-500 font-mono">{err.model}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          err.errorCode === "quota" ? "bg-orange-100 text-orange-700" :
                          err.errorCode === "rate-limit" ? "bg-yellow-100 text-yellow-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {err.errorCode || "unknown"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showAddForm && (
          <AddAccountForm
            onClose={() => setShowAddForm(false)}
            onAdded={() => { setShowAddForm(false); fetchStats(); }}
          />
        )}
      </div>
    </div>
  );
}
