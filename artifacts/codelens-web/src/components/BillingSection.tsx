"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AuthUser } from "@/hooks/use-auth";
import Link from "next/link";

interface BillingSectionProps {
  user: AuthUser;
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  team: "Team",
};

const PLAN_COLORS: Record<string, { bg: string; color: string }> = {
  free: { bg: "var(--bg-secondary)", color: "var(--text-secondary)" },
  pro: { bg: "var(--accent-light)", color: "var(--accent)" },
  team: { bg: "var(--teal-light)", color: "var(--teal)" },
};

const PLAN_LIMITS: Record<string, string> = {
  free: "5 generations/month",
  pro: "Unlimited generations",
  team: "Unlimited generations",
};

export function BillingSection({ user }: BillingSectionProps) {
  const [portalLoading, setPortalLoading] = useState(false);

  const { data: subData } = useQuery({
    queryKey: ["subscription", user.id],
    queryFn: async () => {
      const res = await fetch("/api/stripe/subscription", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const subscription = subData?.subscription;
  const planStyle = PLAN_COLORS[user.plan] || PLAN_COLORS.free;

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/billing-portal", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // silently fail
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      padding: "0.625rem 1rem",
      background: "var(--bg-card)",
      border: "1px solid var(--border-color)",
      borderRadius: "var(--radius-md)",
      marginBottom: "1rem",
      flexWrap: "wrap",
      fontSize: "0.8rem",
    }}>
      <span className="badge" style={{
        background: planStyle.bg,
        color: planStyle.color,
        fontSize: "0.75rem",
        fontWeight: 600,
        padding: "0.2rem 0.5rem",
      }}>
        {PLAN_LABELS[user.plan] || "Free"}
      </span>

      <span style={{ color: "var(--text-secondary)" }}>
        {user.plan === "free"
          ? `${user.monthlyGenerationsUsed}/5 generations`
          : PLAN_LIMITS[user.plan]}
      </span>

      {subscription?.cancel_at_period_end && (
        <span style={{ color: "var(--warning)", fontWeight: 500 }}>
          Cancels at period end
        </span>
      )}

      <div style={{ marginLeft: "auto", display: "flex", gap: "0.375rem", alignItems: "center" }}>
        {user.plan === "free" ? (
          <Link
            href="/pricing"
            className="btn-primary"
            style={{
              textDecoration: "none",
              padding: "0.25rem 0.75rem",
              fontSize: "0.75rem",
            }}
          >
            Upgrade
          </Link>
        ) : (
          <button
            className="btn-ghost"
            onClick={handleManageBilling}
            disabled={portalLoading}
            style={{
              padding: "0.25rem 0.75rem",
              fontSize: "0.75rem",
            }}
          >
            {portalLoading ? "..." : "Manage"}
          </button>
        )}
      </div>
    </div>
  );
}
