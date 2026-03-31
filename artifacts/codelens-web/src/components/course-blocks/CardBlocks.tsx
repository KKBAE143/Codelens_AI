"use client";

import { useState } from "react";
import type {
  V2ArchitectureCardBlock,
  V2DependencyCardBlock,
  V2EnvVarCardBlock,
  V2CommandCardBlock,
} from "@/lib/course-types";

function ArchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A017" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function CopySmall() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function ArchitectureCardBlock({ block }: { block: V2ArchitectureCardBlock }) {
  return (
    <div className="v2-arch-card">
      <div className="v2-card-header-row">
        <ArchIcon />
        <div className="v2-card-badge">Architecture Decision</div>
      </div>
      <h4 className="v2-card-title">{block.decision}</h4>
      <div className="v2-card-section">
        <strong>Rationale</strong>
        <p>{block.rationale}</p>
      </div>
      <div className="v2-card-section">
        <strong>Tradeoffs</strong>
        <p>{block.tradeoffs}</p>
      </div>
      {block.alternatives && (
        <div className="v2-card-section">
          <strong>Alternatives Considered</strong>
          <p>{block.alternatives}</p>
        </div>
      )}
    </div>
  );
}

export function DependencyCardBlock({ block }: { block: V2DependencyCardBlock }) {
  return (
    <div className="v2-dep-card">
      <div className="v2-card-header-row">
        <PackageIcon />
        <div className="v2-card-badge" style={{ background: "var(--teal-light)", color: "var(--teal)" }}>Dependency</div>
      </div>
      <div className="v2-dep-header">
        <code className="v2-dep-name">{block.packageName}</code>
        {block.version && <span className="v2-dep-version">v{block.version}</span>}
      </div>
      <p className="v2-dep-purpose">{block.purpose}</p>
      {block.whatBreaksWithout && (
        <div className="v2-dep-breaks-box">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>{block.whatBreaksWithout}</span>
        </div>
      )}
      {block.alternatives && (
        <div className="v2-card-section" style={{ marginTop: "0.5rem" }}>
          <strong>Alternatives</strong>
          <p>{block.alternatives}</p>
        </div>
      )}
    </div>
  );
}

export function EnvVarCardBlock({ block }: { block: V2EnvVarCardBlock }) {
  return (
    <div className="v2-env-card">
      <div className="v2-card-header-row">
        <KeyIcon />
        <div className="v2-card-badge" style={{ background: "#FFF8E1", color: "#7A6200" }}>Environment Variable</div>
      </div>
      <div className="v2-env-header">
        <code className="v2-env-name">{block.varName}</code>
        <span className={`v2-env-badge ${block.required ? "v2-env-required" : "v2-env-optional"}`}>
          {block.required ? "Required" : "Optional"}
        </span>
      </div>
      <p className="v2-env-purpose">{block.purpose}</p>
      {block.exampleValue && (
        <div className="v2-env-example">
          <span>Example:</span> <code>{block.exampleValue}</code>
        </div>
      )}
      {block.whatBreaksWithout && (
        <div className="v2-dep-breaks-box">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>{block.whatBreaksWithout}</span>
        </div>
      )}
    </div>
  );
}

export function CommandCardBlock({ block }: { block: V2CommandCardBlock }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(block.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="v2-cmd-card">
      <div className="v2-card-header-row">
        <TerminalIcon />
        <div className="v2-card-badge" style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}>Command</div>
      </div>
      <div className="v2-cmd-header">
        <div className="v2-cmd-command-row">
          <code className="v2-cmd-command">$ {block.command}</code>
          <button className="v2-cmd-copy" onClick={handleCopy} title="Copy command">
            {copied ? "Copied" : <CopySmall />}
          </button>
        </div>
      </div>
      <p className="v2-cmd-when"><strong>When:</strong> {block.when}</p>
      {block.expectedOutput && (
        <div className="v2-cmd-output">
          <strong>Expected output:</strong>
          <pre>{block.expectedOutput}</pre>
        </div>
      )}
      {block.commonErrors && block.commonErrors.length > 0 && (
        <div className="v2-cmd-errors">
          <strong>Common errors:</strong>
          {block.commonErrors.map((e, i) => (
            <div key={i} className="v2-cmd-error-item">
              <code>{e.error}</code>
              <span>Fix: {e.fix}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
