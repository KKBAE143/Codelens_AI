"use client";

import type {
  V2ArchitectureCardBlock,
  V2DependencyCardBlock,
  V2EnvVarCardBlock,
  V2CommandCardBlock,
} from "@/lib/course-types";

export function ArchitectureCardBlock({ block }: { block: V2ArchitectureCardBlock }) {
  return (
    <div className="v2-arch-card">
      <div className="v2-card-badge">Architecture Decision</div>
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
      <div className="v2-dep-header">
        <code className="v2-dep-name">{block.packageName}</code>
        {block.version && <span className="v2-dep-version">{block.version}</span>}
      </div>
      <p className="v2-dep-purpose">{block.purpose}</p>
      {block.whatBreaksWithout && (
        <p className="v2-dep-breaks"><strong>Without it:</strong> {block.whatBreaksWithout}</p>
      )}
    </div>
  );
}

export function EnvVarCardBlock({ block }: { block: V2EnvVarCardBlock }) {
  return (
    <div className="v2-env-card">
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
        <p className="v2-env-breaks"><strong>Without it:</strong> {block.whatBreaksWithout}</p>
      )}
    </div>
  );
}

export function CommandCardBlock({ block }: { block: V2CommandCardBlock }) {
  return (
    <div className="v2-cmd-card">
      <div className="v2-cmd-header">
        <code className="v2-cmd-command">$ {block.command}</code>
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
