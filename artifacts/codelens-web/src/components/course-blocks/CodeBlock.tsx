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

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function CodeBlock({ block, githubUrl }: { block: V2CodeBlock; githubUrl?: string }) {
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const codeRef = useRef<HTMLDivElement>(null);

  const lineCount = block.content.split("\n").length;
  const showLineToggle = lineCount > 3;

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

  const lines = block.content.split("\n");
  const startLine = block.lineStart || 1;

  return (
    <div className="v2-code-block">
      <div className="v2-code-header">
        <div className="v2-code-file-info">
          {block.filePath && (
            <>
              <FileIcon />
              {fileLink ? (
                <a href={fileLink} target="_blank" rel="noopener noreferrer" className="v2-code-filepath">
                  {block.filePath}
                  {block.lineStart && <span className="v2-code-lines">:{block.lineStart}{block.lineEnd ? `-${block.lineEnd}` : ""}</span>}
                  <ExternalLinkIcon />
                </a>
              ) : (
                <span className="v2-code-filepath">
                  {block.filePath}
                  {block.lineStart && <span className="v2-code-lines">:{block.lineStart}{block.lineEnd ? `-${block.lineEnd}` : ""}</span>}
                </span>
              )}
            </>
          )}
          {block.language && <span className="v2-code-lang">{block.language}</span>}
        </div>
        <div className="v2-code-actions">
          {showLineToggle && (
            <button
              onClick={() => setShowLineNumbers(!showLineNumbers)}
              className="v2-code-action-btn"
              title={showLineNumbers ? "Hide line numbers" : "Show line numbers"}
            >
              {showLineNumbers ? "#" : "#"}
            </button>
          )}
          <button onClick={handleCopy} className="v2-code-copy" title="Copy code">
            {copied ? <><CheckIcon /> Copied</> : <><CopyIcon /> Copy</>}
          </button>
        </div>
      </div>
      <div className={`v2-code-body ${showLineNumbers ? "v2-code-with-lines" : ""}`}>
        {showLineNumbers && (
          <div className="v2-code-line-numbers" aria-hidden="true">
            {lines.map((_, i) => (
              <span key={i}>{startLine + i}</span>
            ))}
          </div>
        )}
        {highlighted ? (
          <div
            ref={codeRef}
            className="v2-code-shiki"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <pre className="v2-code-pre"><code>{block.content}</code></pre>
        )}
      </div>
      {block.caption && <p className="v2-code-caption">{block.caption}</p>}
    </div>
  );
}
