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

  const PERSONAS: Record<string, { title: string; desc: string }> = {
    free: { title: "Best for", desc: "Students and hobbyists exploring open source projects" },
    pro: { title: "Best for", desc: "Professional developers and vibe coders learning new codebases" },
    team: { title: "Best for", desc: "Engineering teams onboarding new hires and sharing knowledge" },
  };

  const COMPARISON = [
    { feature: "Course generations", free: "5/month", pro: "Unlimited", team: "Unlimited" },
    { feature: "Public repositories", free: true, pro: true, team: true },
    { feature: "Private repositories", free: false, pro: true, team: true },
    { feature: "Knowledge graphs", free: true, pro: true, team: true },
    { feature: "Flashcards & quizzes", free: true, pro: true, team: true },
    { feature: "XP & streaks", free: true, pro: true, team: true },
    { feature: "Priority processing", free: false, pro: true, team: true },
    { feature: "GitHub webhook auto-updates", free: false, pro: true, team: true },
    { feature: "Organizations & teams", free: false, pro: false, team: true },
    { feature: "Course assignments", free: false, pro: false, team: true },
    { feature: "Slack integration", free: false, pro: false, team: true },
    { feature: "Priority support", free: false, pro: false, team: true },
  ];

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "3rem 1.5rem" }}>
      {cancelled && (
        <div style={{ padding: "0.75rem 1rem", background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontSize: "0.9rem", color: "var(--warning)", textAlign: "center" }}>
          Checkout was cancelled. You can try again anytime.
        </div>
      )}

      <div style={{ textAlign: "center", marginBottom: "3rem" }}>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "2.25rem", fontWeight: 700, marginBottom: "0.75rem", letterSpacing: "-0.02em" }}>
          Simple, transparent pricing
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", maxWidth: 500, margin: "0 auto" }}>
          Choose the plan that fits your learning needs. Upgrade or downgrade anytime.
        </p>
      </div>

      {error && (
        <div style={{ padding: "0.75rem 1rem", background: "#FFF0EE", border: "1px solid #FFCDD2", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontSize: "0.9rem", color: "var(--error)", textAlign: "center" }}>
          {error}
        </div>
      )}

      <div className="lms-pricing-grid">
        {PLANS.map((plan) => {
          const isCurrentPlan = currentPlan === plan.plan;
          const isDowngrade =
            (currentPlan === "team" && plan.plan !== "team") ||
            (currentPlan === "pro" && plan.plan === "free");
          const persona = PERSONAS[plan.plan];

          return (
            <div key={plan.plan} className={`lms-pricing-card ${plan.highlighted ? "lms-pricing-card-highlighted" : ""}`}>
              {plan.highlighted && <div className="lms-pricing-popular">Most Popular</div>}

              <h2 className="lms-pricing-name">{plan.name}</h2>

              <div className="lms-pricing-price">
                <strong>{plan.price}</strong>
                <span>{plan.period}</span>
              </div>

              <p className="lms-pricing-desc">{plan.description}</p>

              {persona && (
                <div className="lms-pricing-persona">
                  <strong>{persona.title}</strong>
                  <p>{persona.desc}</p>
                </div>
              )}

              <div className="lms-pricing-features">
                {plan.features.map((feature) => (
                  <div key={feature} className="lms-pricing-feature">
                    <span className="check">&#10003;</span>
                    <span>{feature}</span>
                  </div>
                ))}
                {plan.notIncluded.map((feature) => (
                  <div key={feature} className="lms-pricing-feature" style={{ color: "var(--text-tertiary)" }}>
                    <span className="dash">&mdash;</span>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              {isCurrentPlan ? (
                <div style={{ padding: "0.75rem", textAlign: "center", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", fontSize: "0.9rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Current Plan
                </div>
              ) : plan.plan === "free" ? (
                isDowngrade ? (
                  <Link href="/dashboard" style={{ padding: "0.75rem", textAlign: "center", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", fontSize: "0.9rem", fontWeight: 600, color: "var(--text-secondary)", textDecoration: "none", display: "block" }}>
                    Manage Subscription
                  </Link>
                ) : null
              ) : (
                <button
                  className={plan.highlighted ? "btn-primary" : "btn-secondary"}
                  onClick={() => handleUpgrade(plan.plan)}
                  disabled={!!loadingPlan || isDowngrade}
                  style={{ width: "100%", padding: "0.75rem", fontSize: "0.9rem", fontWeight: 600, opacity: isDowngrade ? 0.5 : 1, cursor: isDowngrade ? "not-allowed" : "pointer" }}
                >
                  {loadingPlan === plan.plan ? "Redirecting..." : isDowngrade ? "Manage via Billing Portal" : plan.cta}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: "center", margin: "3rem 0 2rem" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Feature Comparison
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
          See exactly what&#39;s included in each plan
        </p>
      </div>

      <div className="lms-comparison-table">
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Free</th>
              <th>Pro</th>
              <th>Team</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((row) => (
              <tr key={row.feature}>
                <td>{row.feature}</td>
                {(["free", "pro", "team"] as const).map((p) => (
                  <td key={p}>
                    {typeof row[p] === "boolean" ? (
                      row[p] ? (
                        <span style={{ color: "var(--teal)", fontWeight: 600 }}>&#10003;</span>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>&mdash;</span>
                      )
                    ) : (
                      <span style={{ fontWeight: 500 }}>{row[p]}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="lms-enterprise-cta">
        <h3>Need a custom solution?</h3>
        <p>
          Enterprise plans with SSO, dedicated support, custom integrations, and volume discounts.
        </p>
        <a href="mailto:team@codelensai.com" className="btn-primary" style={{ textDecoration: "none", display: "inline-block" }}>
          Contact Sales
        </a>
      </div>

      <div style={{ textAlign: "center", marginTop: "2rem", padding: "1.5rem", fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
        All plans include access to our AI-powered course generation.
        {isAuthenticated && currentPlan !== "free" && (
          <span>
            {" "}Need to manage your subscription?{" "}
            <button
              onClick={async () => {
                const res = await fetch("/api/stripe/billing-portal", { method: "POST", credentials: "include" });
                const data = await res.json();
                if (data.url) window.location.href = data.url;
              }}
              style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontWeight: 600, fontSize: "inherit", textDecoration: "underline" }}
            >
              Open Billing Portal
            </button>
          </span>
        )}
      </div>
    </main>
  );
}
