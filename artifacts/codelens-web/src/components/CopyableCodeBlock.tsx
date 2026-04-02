"use client";

import { useState, useCallback } from "react";

interface Props {
  code: string;
  language?: string;
  filename?: string;
}

export function CopyableCodeBlock({ code, language, filename }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleCopy();
    }
  };

  return (
    <div className="relative group rounded-lg overflow-hidden border border-white/10 bg-[#1E1E2E]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          {filename && (
            <span className="text-xs text-white/50 font-mono">{filename}</span>
          )}
          {language && (
            <span className="text-xs text-white/40 font-mono uppercase tracking-wider">
              {language}
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          onKeyDown={handleKeyDown}
          aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
          className={`
            flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium
            transition-all duration-200 cursor-pointer
            ${copied
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
            }
          `}
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code block */}
      <pre className="p-4 overflow-x-auto text-sm leading-relaxed">
        <code className="text-white/90 font-mono whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}
