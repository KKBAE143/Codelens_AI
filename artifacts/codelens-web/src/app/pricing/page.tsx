"use client";

import { useState, Suspense } from "react";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with code learning",
    features: [
      "5 course generations per month",
      "Public repositories",
      "All target audiences",
      "Share courses via link",
    ],
    notIncluded: [
      "Private repositories",
      "Priority processing",
      "Team management",
      "Slack integration",
    ],
    cta: "Current Plan",
    plan: "free",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/month",
    description: "For power users and professionals",
    features: [
      "Unlimited generations",
      "Private repositories",
      "Priority processing",
      "All target audiences",
      "Share courses via link",
      "GitHub webhook auto-updates",
    ],
    notIncluded: ["Team management", "Slack integration", "Course assignments"],
    cta: "Upgrade to Pro",
    plan: "pro",
    highlighted: true,
  },
  {
    name: "Team",
    price: "$49",
    period: "/month per seat",
    description: "For teams and organizations",
    features: [
      "Everything in Pro",
      "Organizations & team management",
      "Slack integration",
      "Course assignments & due dates",
      "Team activity dashboard",
      "Priority support",
    ],
    notIncluded: [],
    cta: "Upgrade to Team",
    plan: "team",
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <main className="main-content">
          <div className="loading-container">
            <p>Loading...</p>
          </div>
        </main>
      }
    >
      <PricingContent />
    </Suspense>
  );
}

function PricingContent() {
  const { user, isAuthenticated, login, isLoading: authLoading } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const cancelled = searchParams.get("checkout") === "cancelled";

  const handleUpgrade = async (plan: string) => {
    if (!isAuthenticated) {
      login();
      return;
    }

    setLoadingPlan(plan);
    setError(null);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start checkout");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoadingPlan(null);
    }
  };

  const currentPlan = user?.plan || "free";

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "3rem 1.5rem" }}>
      {cancelled && (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "#FFF8E1",
            border: "1px solid #FFE082",
            borderRadius: "var(--radius-md)",
            marginBottom: "1.5rem",
            fontSize: "0.9rem",
            color: "var(--warning)",
            textAlign: "center",
          }}
        >
          Checkout was cancelled. You can try again anytime.
        </div>
      )}

      <div style={{ textAlign: "center", marginBottom: "3rem" }}>
        <h1
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "2.25rem",
            fontWeight: 700,
            marginBottom: "0.75rem",
          }}
        >
          Simple, transparent pricing
        </h1>
        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: "1.1rem",
            maxWidth: 500,
            margin: "0 auto",
          }}
        >
          Choose the plan that fits your learning needs. Upgrade or downgrade
          anytime.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "#FFF0EE",
            border: "1px solid #FFCDD2",
            borderRadius: "var(--radius-md)",
            marginBottom: "1.5rem",
            fontSize: "0.9rem",
            color: "var(--error)",
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {PLANS.map((plan) => {
          const isCurrentPlan = currentPlan === plan.plan;
          const isDowngrade =
            (currentPlan === "team" && plan.plan !== "team") ||
            (currentPlan === "pro" && plan.plan === "free");

          return (
            <div
              key={plan.plan}
              style={{
                background: "white",
                border: plan.highlighted
                  ? "2px solid var(--accent)"
                  : "1px solid var(--border-color)",
                borderRadius: "var(--radius-lg)",
                padding: "2rem",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                boxShadow: plan.highlighted
                  ? "var(--shadow-md)"
                  : "var(--shadow-sm)",
              }}
            >
              {plan.highlighted && (
                <div
                  style={{
                    position: "absolute",
                    top: -12,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "var(--accent)",
                    color: "white",
                    padding: "0.25rem 1rem",
                    borderRadius: "var(--radius-full)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    letterSpacing: "0.03em",
                    textTransform: "uppercase",
                  }}
                >
                  Most Popular
                </div>
              )}

              <h2
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  marginBottom: "0.25rem",
                }}
              >
                {plan.name}
              </h2>

              <div style={{ marginBottom: "0.5rem" }}>
                <span
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "2.5rem",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}
                >
                  {plan.price}
                </span>
                <span
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  {plan.period}
                </span>
              </div>

              <p
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "0.9rem",
                  marginBottom: "1.5rem",
                  lineHeight: 1.5,
                }}
              >
                {plan.description}
              </p>

              <div style={{ flex: 1, marginBottom: "1.5rem" }}>
                {plan.features.map((feature) => (
                  <div
                    key={feature}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.5rem",
                      marginBottom: "0.625rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    <span
                      style={{
                        color: "var(--teal)",
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      ✓
                    </span>
                    <span>{feature}</span>
                  </div>
                ))}
                {plan.notIncluded.map((feature) => (
                  <div
                    key={feature}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.5rem",
                      marginBottom: "0.625rem",
                      fontSize: "0.875rem",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    <span style={{ flexShrink: 0, marginTop: 1 }}>—</span>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              {isCurrentPlan ? (
                <div
                  style={{
                    padding: "0.75rem",
                    textAlign: "center",
                    background: "var(--bg-secondary)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                  }}
                >
                  Current Plan
                </div>
              ) : plan.plan === "free" ? (
                isDowngrade ? (
                  <Link
                    href="/dashboard"
                    style={{
                      padding: "0.75rem",
                      textAlign: "center",
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--radius-md)",
                      fontSize: "0.9rem",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      textDecoration: "none",
                      display: "block",
                    }}
                  >
                    Manage Subscription
                  </Link>
                ) : null
              ) : (
                <button
                  className={plan.highlighted ? "btn-primary" : "btn-secondary"}
                  onClick={() => handleUpgrade(plan.plan)}
                  disabled={!!loadingPlan || isDowngrade}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    opacity: isDowngrade ? 0.5 : 1,
                    cursor: isDowngrade ? "not-allowed" : "pointer",
                  }}
                >
                  {loadingPlan === plan.plan
                    ? "Redirecting..."
                    : isDowngrade
                      ? "Manage via Billing Portal"
                      : plan.cta}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          textAlign: "center",
          marginTop: "3rem",
          padding: "2rem",
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-lg)",
        }}
      >
        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: "0.9rem",
            lineHeight: 1.6,
          }}
        >
          All plans include access to our AI-powered course generation.
          {isAuthenticated && currentPlan !== "free" && (
            <span>
              {" "}
              Need to manage your subscription?{" "}
              <button
                onClick={async () => {
                  const res = await fetch("/api/stripe/billing-portal", {
                    method: "POST",
                    credentials: "include",
                  });
                  const data = await res.json();
                  if (data.url) window.location.href = data.url;
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent)",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "inherit",
                  textDecoration: "underline",
                }}
              >
                Open Billing Portal
              </button>
            </span>
          )}
        </p>
      </div>
    </main>
  );
}
