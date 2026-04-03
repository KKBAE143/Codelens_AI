"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { V2MermaidBlock } from "@/lib/course-types";

let mermaidInitialized = false;

function removeMermaidOrphan(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.remove();
  document.getElementById(`d${id}`)?.remove();
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

function getDiagramTitle(diagramType?: V2MermaidBlock["diagramType"]): string {
  switch (diagramType) {
    case "sequenceDiagram":
      return "Sequence diagram";
    case "classDiagram":
      return "Class diagram";
    case "erDiagram":
      return "Entity relationship diagram";
    case "flowchart":
      return "Dependency diagram";
    case "graph":
      return "Relationship graph";
    default:
      return "System diagram";
  }
}

function getDiagramCaption(block: V2MermaidBlock): string {
  return block.caption || "This diagram maps the key parts mentioned in this lesson and how they connect.";
}

export function MermaidBlock({ block }: { block: V2MermaidBlock }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2, 10)}`);
  const diagramTitle = getDiagramTitle(block.diagramType);
  const diagramCaption = getDiagramCaption(block);

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
            themeVariables: {
              fontSize: "16px",
              lineColor: "#475569",
              primaryColor: "#FFF7F1",
              primaryBorderColor: "#D7B08C",
              primaryTextColor: "#1F2937",
              secondaryColor: "#EFF4FF",
              secondaryBorderColor: "#94A3B8",
              tertiaryColor: "#F4F4F5",
              tertiaryBorderColor: "#9CA3AF",
              edgeLabelBackground: "#FFFDF9",
              clusterBkg: "#FFFDF9",
              clusterBorder: "#CBD5E1",
            },
          });
          mermaidInitialized = true;
        }

        const { svg: renderedSvg } = await mermaid.render(idRef.current, block.source);
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
        <span className="v2-mermaid-error-icon">Diagram</span>
        <p>This diagram could not be rendered. Here is the source:</p>
        <pre><code>{block.source}</code></pre>
      </div>
    );
  }

  return (
    <>
      <div className="v2-mermaid-block" role="figure">
        <div className="v2-mermaid-card-head">
          <div>
            <span className="v2-mermaid-kicker">Diagram</span>
            <h3 className="v2-mermaid-title">{diagramTitle}</h3>
          </div>
          {svg && (
            <button
              className="v2-mermaid-zoom-btn"
              onClick={() => setShowModal(true)}
              title="Click to enlarge"
              aria-label="Enlarge diagram"
            >
              <ZoomIcon /> Enlarge
            </button>
          )}
        </div>
        {svg ? (
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
        ) : (
          <div className="v2-mermaid-loading">Loading diagram...</div>
        )}
        <p className="v2-mermaid-caption">{diagramCaption}</p>
      </div>

      {showModal && svg && (
        <div className="v2-mermaid-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="v2-mermaid-modal" onClick={(e) => e.stopPropagation()}>
            <div className="v2-mermaid-modal-header">
              <span className="v2-mermaid-modal-title">
                {diagramTitle}
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
