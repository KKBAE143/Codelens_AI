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
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "1rem",
        flexWrap: "wrap",
        gap: "0.5rem",
      }}>
        <h2 style={{
          fontFamily: "var(--font-heading)",
          fontSize: "1.1rem",
          fontWeight: 600,
        }}>
          Subscription & Billing
        </h2>
        <span className="badge" style={{
          background: planStyle.bg,
          color: planStyle.color,
          fontSize: "0.8rem",
          fontWeight: 600,
          padding: "0.25rem 0.75rem",
        }}>
          {PLAN_LABELS[user.plan] || "Free"} Plan
        </span>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "1rem",
        marginBottom: "1rem",
      }}>
        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Plan
          </div>
          <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>
            {PLAN_LABELS[user.plan] || "Free"}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Usage
          </div>
          <div style={{ fontSize: "0.9rem", fontWeight: 500 }}>
            {user.plan === "free"
              ? `${user.monthlyGenerationsUsed} / 5 generations used`
              : PLAN_LIMITS[user.plan]}
          </div>
        </div>

        {subscription?.current_period_end && (
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Next Billing
            </div>
            <div style={{ fontSize: "0.9rem", fontWeight: 500 }}>
              {new Date(
                typeof subscription.current_period_end === "number"
                  ? subscription.current_period_end * 1000
                  : subscription.current_period_end
              ).toLocaleDateString()}
            </div>
          </div>
        )}

        {subscription?.cancel_at_period_end && (
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Status
            </div>
            <div style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--warning)" }}>
              Cancels at period end
            </div>
          </div>
        )}
      </div>

      <div style={{
        display: "flex",
        gap: "0.5rem",
        flexWrap: "wrap",
        paddingTop: "0.75rem",
        borderTop: "1px solid var(--border-color)",
      }}>
        {user.plan === "free" ? (
          <Link
            href="/pricing"
            className="btn-primary"
            style={{
              textDecoration: "none",
              padding: "0.5rem 1rem",
              fontSize: "0.85rem",
            }}
          >
            Upgrade Plan
          </Link>
        ) : (
          <>
            <button
              className="btn-secondary"
              onClick={handleManageBilling}
              disabled={portalLoading}
              style={{
                padding: "0.5rem 1rem",
                fontSize: "0.85rem",
              }}
            >
              {portalLoading ? "Loading..." : "Manage Subscription"}
            </button>
            <Link
              href="/pricing"
              className="btn-ghost"
              style={{
                textDecoration: "none",
                padding: "0.5rem 1rem",
                fontSize: "0.85rem",
              }}
            >
              Change Plan
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
