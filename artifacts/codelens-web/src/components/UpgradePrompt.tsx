"use client";

import Link from "next/link";

interface UpgradePromptProps {
  remaining?: number;
  resetAt?: string;
  context?: "rate-limit" | "inline";
}

export function UpgradePrompt({ remaining, resetAt, context = "rate-limit" }: UpgradePromptProps) {
  const resetDate = resetAt ? new Date(resetAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  }) : null;

  if (context === "inline") {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.625rem 1rem",
        background: "#FFF8E1",
        border: "1px solid #FFE082",
        borderRadius: "var(--radius-md)",
        fontSize: "0.85rem",
      }}>
        <span style={{ color: "var(--warning)", fontWeight: 500 }}>
          {remaining !== undefined && remaining <= 2
            ? `${remaining} generation${remaining !== 1 ? "s" : ""} remaining this month`
            : "Running low on generations"}
        </span>
        <Link
          href="/pricing"
          style={{
            color: "var(--accent)",
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Upgrade →
        </Link>
      </div>
    );
  }

  return (
    <div style={{
      textAlign: "center",
      padding: "2rem",
      background: "white",
      border: "1px solid var(--border-color)",
      borderRadius: "var(--radius-lg)",
      maxWidth: 480,
      margin: "0 auto",
    }}>
      <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>
        ⚡
      </div>
      <h3 style={{
        fontFamily: "var(--font-heading)",
        fontSize: "1.25rem",
        fontWeight: 700,
        marginBottom: "0.5rem",
      }}>
        Generation limit reached
      </h3>
      <p style={{
        color: "var(--text-secondary)",
        fontSize: "0.9rem",
        lineHeight: 1.6,
        marginBottom: "0.25rem",
      }}>
        You've used all 5 free generations this month.
        {resetDate && (
          <span> Your limit resets on {resetDate}.</span>
        )}
      </p>
      <p style={{
        color: "var(--text-secondary)",
        fontSize: "0.9rem",
        lineHeight: 1.6,
        marginBottom: "1.5rem",
      }}>
        Upgrade to Pro for unlimited course generations, private repo support, and priority processing.
      </p>
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
        <Link
          href="/pricing"
          className="btn-primary"
          style={{
            textDecoration: "none",
            padding: "0.625rem 1.5rem",
            fontSize: "0.9rem",
          }}
        >
          View Plans & Upgrade
        </Link>
      </div>
    </div>
  );
}
