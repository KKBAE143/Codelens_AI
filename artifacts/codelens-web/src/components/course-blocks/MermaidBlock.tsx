"use client";

import { useEffect, useRef, useState } from "react";
import type { V2MermaidBlock } from "@/lib/course-types";

let mermaidInitialized = false;

export function MermaidBlock({ block }: { block: V2MermaidBlock }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
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
          });
          mermaidInitialized = true;
        }

        const { svg: renderedSvg } = await mermaid.render(idRef.current, block.source);
        if (!cancelled) {
          setSvg(renderedSvg);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    renderDiagram();
    return () => { cancelled = true; };
  }, [block.source]);

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
    <div className="v2-mermaid-block">
      {svg ? (
        <div
          ref={containerRef}
          className="v2-mermaid-svg"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="v2-mermaid-loading">Loading diagram...</div>
      )}
      {block.caption && <p className="v2-mermaid-caption">{block.caption}</p>}
    </div>
  );
}
