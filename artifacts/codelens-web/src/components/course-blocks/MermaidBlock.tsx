"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { V2MermaidBlock } from "@/lib/course-types";

let mermaidInitialized = false;

function removeMermaidOrphan(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.remove();
  document.getElementById(`d${id}`)?.remove();
}

function sanitizeMermaidSource(source: string): string {
  let s = source.trim();

  s = s.replace(/\r\n/g, "\n");

  s = s.replace(/&nbsp;/g, " ");
  s = s.replace(/&amp;/g, "&");

  s = s.replace(/\u200B/g, "");

  s = s.replace(/[""\u201C\u201D]/g, '"');
  s = s.replace(/[''`\u2018\u2019]/g, "'");

  s = s.replace(/\u2192/g, "-->");
  s = s.replace(/\u2190/g, "<--");

  s = s.replace(/- ->/g, "-->");
  s = s.replace(/-- >/g, "-->");
  s = s.replace(/< --/g, "<--");

  const lines = s.split("\n");
  const cleaned: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) continue;
    if (/^style\s+\S+\s/.test(trimmed) && !trimmed.includes("fill") && !trimmed.includes("stroke") && !trimmed.includes("color")) continue;
    if (/^linkStyle\s/.test(trimmed) && !trimmed.includes("stroke")) continue;
    cleaned.push(line);
  }
  s = cleaned.join("\n");

  if (!/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|journey|mindmap|timeline|quadrantChart|sankey|xychart)/m.test(s)) {
    s = `flowchart TD\n${s}`;
  }

  return s;
}

function ZoomIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function MermaidBlock({ block }: { block: V2MermaidBlock }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const mermaid = (await import("mermaid")).default;
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: "neutral",
            securityLevel: "strict",
            fontFamily: "var(--font-body)",
            suppressErrorRendering: true,
          });
          mermaidInitialized = true;
        }

        const cleanedSource = sanitizeMermaidSource(block.source);
        const { svg: renderedSvg } = await mermaid.render(idRef.current, cleanedSource);
        if (!cancelled) {
          setError(false);
          setSvg(renderedSvg);
        }
      } catch {
        removeMermaidOrphan(idRef.current);
        if (!cancelled) setError(true);
      }
    }

    renderDiagram();
    return () => { cancelled = true; };
  }, [block.source]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setShowModal(false);
  }, []);

  useEffect(() => {
    if (showModal) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [showModal, handleKeyDown]);

  if (error) {
    return (
      <div className="v2-mermaid-error">
        <div className="v2-mermaid-error-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
          <span>Diagram Preview Unavailable</span>
        </div>
        <p className="v2-mermaid-error-desc">
          {block.caption || (block.diagramType ? `This ${block.diagramType} diagram` : "This diagram")} couldn&apos;t be rendered. The source is shown below for reference.
        </p>
        <details className="v2-mermaid-error-details">
          <summary>View diagram source</summary>
          <pre><code>{block.source}</code></pre>
        </details>
      </div>
    );
  }

  return (
    <>
      <div className="v2-mermaid-block" role="figure">
        {svg ? (
          <>
            <div
              ref={containerRef}
              className="v2-mermaid-svg"
              onClick={() => setShowModal(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setShowModal(true); }}
              aria-label="Click to enlarge diagram"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <button
              className="v2-mermaid-zoom-btn"
              onClick={() => setShowModal(true)}
              title="Click to enlarge"
              aria-label="Enlarge diagram"
            >
              <ZoomIcon /> Enlarge
            </button>
          </>
        ) : (
          <div className="v2-mermaid-loading">Loading diagram...</div>
        )}
        {block.caption && <p className="v2-mermaid-caption">{block.caption}</p>}
      </div>

      {showModal && svg && (
        <div className="v2-mermaid-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="v2-mermaid-modal" onClick={(e) => e.stopPropagation()}>
            <div className="v2-mermaid-modal-header">
              <span className="v2-mermaid-modal-title">
                {block.caption || (block.diagramType ? `${block.diagramType} diagram` : "Diagram")}
              </span>
              <button
                className="v2-mermaid-modal-close"
                onClick={() => setShowModal(false)}
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>
            <div
              className="v2-mermaid-modal-body"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </div>
      )}
    </>
  );
}
