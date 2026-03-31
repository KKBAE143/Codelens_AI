"use client";

import { useState, useEffect, useRef } from "react";
import type { V2CodeBlock } from "@/lib/course-types";

let highlighterPromise: Promise<import("shiki").Highlighter> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((shiki) =>
      shiki.createHighlighter({
        themes: ["catppuccin-mocha"],
        langs: [
          "typescript", "javascript", "tsx", "jsx", "python", "rust", "go",
          "java", "css", "html", "json", "yaml", "toml", "bash", "shell",
          "sql", "graphql", "markdown", "c", "cpp", "csharp", "ruby",
          "php", "swift", "kotlin", "dart", "dockerfile", "makefile",
        ],
      })
    );
  }
  return highlighterPromise;
}

export function CodeBlock({ block, githubUrl }: { block: V2CodeBlock; githubUrl?: string }) {
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const codeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    getHighlighter()
      .then((highlighter) => {
        if (cancelled) return;
        const lang = block.language?.toLowerCase() || "text";
        const loadedLangs = highlighter.getLoadedLanguages();
        const resolvedLang = loadedLangs.includes(lang as never) ? lang : "text";

        const html = highlighter.codeToHtml(block.content, {
          lang: resolvedLang,
          theme: "catppuccin-mocha",
        });
        if (!cancelled) setHighlighted(html);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [block.content, block.language]);

  const handleCopy = () => {
    navigator.clipboard.writeText(block.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fileLink = githubUrl && block.filePath
    ? `${githubUrl}/blob/main/${block.filePath}${block.lineStart ? `#L${block.lineStart}${block.lineEnd ? `-L${block.lineEnd}` : ""}` : ""}`
    : null;

  return (
    <div className="v2-code-block">
      <div className="v2-code-header">
        <div className="v2-code-file-info">
          {block.filePath && (
            fileLink ? (
              <a href={fileLink} target="_blank" rel="noopener noreferrer" className="v2-code-filepath">
                {block.filePath}
                {block.lineStart && <span className="v2-code-lines">:{block.lineStart}{block.lineEnd ? `-${block.lineEnd}` : ""}</span>}
              </a>
            ) : (
              <span className="v2-code-filepath">
                {block.filePath}
                {block.lineStart && <span className="v2-code-lines">:{block.lineStart}{block.lineEnd ? `-${block.lineEnd}` : ""}</span>}
              </span>
            )
          )}
          {block.language && <span className="v2-code-lang">{block.language}</span>}
        </div>
        <button onClick={handleCopy} className="v2-code-copy" title="Copy code">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {highlighted ? (
        <div
          ref={codeRef}
          className="v2-code-shiki"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      ) : (
        <pre className="v2-code-pre"><code>{block.content}</code></pre>
      )}
      {block.caption && <p className="v2-code-caption">{block.caption}</p>}
    </div>
  );
}
