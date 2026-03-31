"use client";

import type { V2CalloutBlock } from "@/lib/course-types";

const CALLOUT_CONFIG: Record<string, { icon: string; label: string; className: string }> = {
  warning: { icon: "Warning", label: "Warning", className: "v2-callout-warning" },
  tip: { icon: "Tip", label: "Tip", className: "v2-callout-tip" },
  "ai-hint": { icon: "AI", label: "AI Insight", className: "v2-callout-ai" },
  "first-pr": { icon: "PR", label: "First PR Opportunity", className: "v2-callout-pr" },
  security: { icon: "Security", label: "Security Note", className: "v2-callout-security" },
  command: { icon: "$", label: "Command", className: "v2-callout-command" },
};

export function CalloutBlock({ block }: { block: V2CalloutBlock }) {
  const config = CALLOUT_CONFIG[block.variant] || CALLOUT_CONFIG.tip;

  return (
    <div className={`v2-callout ${config.className}`}>
      <div className="v2-callout-header">
        <span className="v2-callout-icon">{config.icon}</span>
        <span className="v2-callout-label">{config.label}</span>
      </div>
      <div className="v2-callout-content">{block.content}</div>
    </div>
  );
}
