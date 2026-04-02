"use client";

import { useState } from "react";

interface EnvVar {
  key: string;
  value: string;
  comment?: string;
}

interface Props {
  vars: EnvVar[];
}

function MaskedValue({ value, revealed }: { value: string; revealed: boolean }) {
  if (revealed) return <span className="text-emerald-400">{value}</span>;
  return <span className="text-white/40">{"•".repeat(Math.min(value.length, 12))}</span>;
}

export function EnvVarList({ vars }: Props) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copiedSingle, setCopiedSingle] = useState<string | null>(null);

  const toggleReveal = (key: string) => {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const copySingle = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedSingle(key);
    setTimeout(() => setCopiedSingle(null), 2000);
  };

  const copyAll = async () => {
    const text = vars.map((v) => `${v.key}=${v.value}`).join("\n");
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="rounded-lg border border-white/10 bg-[#1E1E2E] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-sm font-medium text-white/80">Environment Variables</span>
        <button
          onClick={copyAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 transition-all cursor-pointer"
          aria-label="Copy all environment variables"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy All
        </button>
      </div>

      {/* Variable list */}
      <div className="divide-y divide-white/5">
        {vars.map((v) => (
          <div key={v.key} className="group px-4 py-3 hover:bg-white/[0.02] transition-colors">
            {v.comment && (
              <div className="text-xs text-white/30 mb-1 font-mono"># {v.comment}</div>
            )}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <code className="text-sm font-mono text-sky-400 shrink-0">{v.key}</code>
              <span className="text-white/20 shrink-0">=</span>
              <code className="text-sm font-mono flex-1 min-w-0 break-all">
                <MaskedValue value={v.value} revealed={!!revealed[v.key]} />
              </code>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggleReveal(v.key)}
                  className="px-2 py-1 rounded text-xs text-white/40 hover:text-white/70 hover:bg-white/5 transition-all cursor-pointer"
                  aria-label={revealed[v.key] ? "Hide value" : "Show value"}
                >
                  {revealed[v.key] ? "Hide" : "Show"}
                </button>
                <button
                  onClick={() => copySingle(v.key, v.value)}
                  className="px-2 py-1 rounded text-xs text-white/40 hover:text-white/70 hover:bg-white/5 transition-all cursor-pointer"
                  aria-label={`Copy ${v.key}`}
                >
                  {copiedSingle === v.key ? "✓" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
