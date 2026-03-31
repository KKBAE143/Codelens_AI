"use client";

import type { V2CalloutBlock } from "@/lib/course-types";

function WarningIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function TipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="9" y1="18" x2="15" y2="18" />
      <line x1="10" y1="22" x2="14" y2="22" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </svg>
  );
}

function AiIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function PrIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function SecurityIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CommandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

const CALLOUT_CONFIG: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
  warning: { icon: <WarningIcon />, label: "Warning", className: "v2-callout-warning" },
  tip: { icon: <TipIcon />, label: "Tip", className: "v2-callout-tip" },
  "ai-hint": { icon: <AiIcon />, label: "AI Insight", className: "v2-callout-ai" },
  "first-pr": { icon: <PrIcon />, label: "First PR Opportunity", className: "v2-callout-pr" },
  security: { icon: <SecurityIcon />, label: "Security Note", className: "v2-callout-security" },
  command: { icon: <CommandIcon />, label: "Command", className: "v2-callout-command" },
};

export function CalloutBlock({ block }: { block: V2CalloutBlock }) {
  const config = CALLOUT_CONFIG[block.variant] || CALLOUT_CONFIG.tip;

  return (
    <div className={`v2-callout ${config.className}`}>
      <div className="v2-callout-header">
        <span className="v2-callout-icon-svg">{config.icon}</span>
        <span className="v2-callout-label">{config.label}</span>
      </div>
      <div className="v2-callout-content">{block.content}</div>
    </div>
  );
}
