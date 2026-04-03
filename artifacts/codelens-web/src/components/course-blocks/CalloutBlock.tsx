"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { V2CalloutBlock } from "@/lib/course-types";

function WarningIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function TipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="9" y1="18" x2="15" y2="18" />
      <line x1="10" y1="22" x2="14" y2="22" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </svg>
  );
}

function AiIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function PrIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function SecurityIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CommandIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

interface CalloutConfig {
  icon: React.ReactNode;
  label: string;
  className: string;
  accentColor: string;
  bgGradient: string;
}

const CALLOUT_CONFIG: Record<string, CalloutConfig> = {
  warning: {
    icon: <WarningIcon />,
    label: "Warning",
    className: "v2-callout-warning",
    accentColor: "#D97706",
    bgGradient: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)",
  },
  tip: {
    icon: <TipIcon />,
    label: "Tip",
    className: "v2-callout-tip",
    accentColor: "#0D9488",
    bgGradient: "linear-gradient(135deg, #F0FDFA 0%, #CCFBF1 100%)",
  },
  "ai-hint": {
    icon: <AiIcon />,
    label: "AI Insight",
    className: "v2-callout-ai",
    accentColor: "#7C3AED",
    bgGradient: "linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)",
  },
  "first-pr": {
    icon: <PrIcon />,
    label: "First PR Opportunity",
    className: "v2-callout-pr",
    accentColor: "#2563EB",
    bgGradient: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
  },
  security: {
    icon: <SecurityIcon />,
    label: "Security Note",
    className: "v2-callout-security",
    accentColor: "#DC2626",
    bgGradient: "linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)",
  },
  command: {
    icon: <CommandIcon />,
    label: "Command",
    className: "v2-callout-command",
    accentColor: "#6B7280",
    bgGradient: "linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%)",
  },
};

const calloutMarkdownComponents: Components = {
  p({ children }) {
    return <p style={{ margin: "0 0 0.375rem 0" }}>{children}</p>;
  },
  ul({ children }) {
    return <ul style={{ margin: "0.25rem 0 0.25rem 1.25rem", padding: 0 }}>{children}</ul>;
  },
  ol({ children }) {
    return <ol style={{ margin: "0.25rem 0 0.25rem 1.25rem", padding: 0 }}>{children}</ol>;
  },
  li({ children }) {
    return <li style={{ marginBottom: "0.125rem" }}>{children}</li>;
  },
  code({ children }) {
    return (
      <code style={{
        background: "rgba(0,0,0,0.06)",
        padding: "0.1em 0.35em",
        borderRadius: "4px",
        fontSize: "0.85em",
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
      }}>
        {children}
      </code>
    );
  },
  pre({ children }) {
    return (
      <pre style={{
        background: "rgba(0,0,0,0.06)",
        padding: "0.75rem 1rem",
        borderRadius: "6px",
        overflowX: "auto",
        margin: "0.5rem 0",
        fontSize: "0.82em",
      }}>
        {children}
      </pre>
    );
  },
  strong({ children }) {
    return <strong style={{ fontWeight: 600 }}>{children}</strong>;
  },
  a({ href, children }) {
    return (
      <a href={href} style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: "2px" }}>
        {children}
      </a>
    );
  },
};

export function CalloutBlock({ block }: { block: V2CalloutBlock }) {
  const config = CALLOUT_CONFIG[block.variant] || CALLOUT_CONFIG.tip;

  return (
    <div
      className={`v2-callout ${config.className}`}
      style={{
        background: config.bgGradient,
        borderLeft: `4px solid ${config.accentColor}`,
        borderRadius: "0 12px 12px 0",
        padding: "1rem 1.25rem",
        margin: "1rem 0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div className="v2-callout-header" style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        marginBottom: "0.625rem",
      }}>
        <span className="v2-callout-icon-svg" style={{
          display: "flex",
          alignItems: "center",
          color: config.accentColor,
          flexShrink: 0,
        }}>
          {config.icon}
        </span>
        <span className="v2-callout-label" style={{
          fontSize: "0.8rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: config.accentColor,
        }}>
          {config.label}
        </span>
      </div>
      <div className="v2-callout-content" style={{
        fontSize: "0.875rem",
        lineHeight: 1.65,
        color: "#1F2937",
      }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={calloutMarkdownComponents}>
          {block.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
