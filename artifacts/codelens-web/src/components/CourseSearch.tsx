"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import type { V2Module, V2Block } from "@/lib/course-types";

interface SearchResult {
  moduleIndex: number;
  moduleTitle: string;
  blockIndex: number;
  snippet: string;
  matchType: string;
}

function extractBlockText(block: V2Block): string {
  switch (block.type) {
    case "text": return block.content.replace(/<[^>]+>/g, " ");
    case "code": return `${block.filePath || ""} ${block.content} ${block.caption || ""}`;
    case "callout": return block.content;
    case "quiz": return `${block.question} ${block.scenario || ""} ${block.options.map((o) => o.text).join(" ")}`;
    case "mermaid": return block.caption || "";
    case "file-list": return block.files.map((f) => `${f.path} ${f.role}`).join(" ");
    case "architecture-card": return `${block.decision} ${block.rationale} ${block.tradeoffs}`;
    case "dependency-card": return `${block.packageName} ${block.purpose}`;
    case "env-var-card": return `${block.varName} ${block.purpose}`;
    case "command-card": return `${block.command} ${block.when}`;
    case "exercise": return `${block.title} ${block.task}`;
    default: return "";
  }
}

function getMatchSnippet(text: string, query: string, maxLen: number = 120): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, maxLen);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  if (parts.length <= 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="course-search-highlight">{part}</mark>
      : part
  );
}

interface CourseSearchProps {
  modules: V2Module[];
  onNavigate: (moduleIndex: number, blockIndex: number) => void;
}

export function CourseSearch({ modules, onNavigate }: CourseSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const search = useCallback((q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }

    const found: SearchResult[] = [];
    const lower = q.toLowerCase();

    for (const mod of modules) {
      if (mod.title.toLowerCase().includes(lower)) {
        found.push({
          moduleIndex: mod.index,
          moduleTitle: mod.title,
          blockIndex: 0,
          snippet: mod.learningObjective || mod.title,
          matchType: "Module",
        });
      }

      for (let bi = 0; bi < mod.blocks.length; bi++) {
        const text = extractBlockText(mod.blocks[bi]);
        if (text.toLowerCase().includes(lower)) {
          found.push({
            moduleIndex: mod.index,
            moduleTitle: mod.title,
            blockIndex: bi,
            snippet: getMatchSnippet(text, q),
            matchType: mod.blocks[bi].type,
          });
        }
        if (found.length >= 20) break;
      }
      if (found.length >= 20) break;
    }

    setResults(found);
  }, [modules]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <>
      <button className="course-search-trigger" onClick={() => { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span className="course-search-trigger-text">Search course</span>
        <kbd className="course-search-kbd">⌘K</kbd>
      </button>

      {isOpen && (
        <div className="course-search-overlay" onClick={() => setIsOpen(false)}>
          <div className="course-search-panel" ref={panelRef} onClick={(e) => e.stopPropagation()}>
            <div className="course-search-input-row">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                className="course-search-input"
                placeholder="Search modules, code, concepts..."
                value={query}
                onChange={(e) => search(e.target.value)}
                autoFocus
              />
              {query && (
                <button className="course-search-clear" onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            {results.length > 0 && (
              <div className="course-search-results">
                {results.map((r, i) => (
                  <button
                    key={i}
                    className="course-search-result"
                    onClick={() => {
                      onNavigate(r.moduleIndex, r.blockIndex);
                      setIsOpen(false);
                      setQuery("");
                      setResults([]);
                    }}
                  >
                    <div className="course-search-result-header">
                      <span className="course-search-result-module">{r.moduleTitle}</span>
                      <span className="course-search-result-type">{r.matchType}</span>
                    </div>
                    <div className="course-search-result-snippet">{highlightMatch(r.snippet, query)}</div>
                  </button>
                ))}
              </div>
            )}

            {query.trim().length >= 2 && results.length === 0 && (
              <div className="course-search-empty">No results found for &ldquo;{query}&rdquo;</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
