"use client";

import { useState, useEffect } from "react";

const DEFAULT_STEPS = [
  { id: "node", label: "Node.js 20+ installed", command: "node --version" },
  { id: "pnpm", label: "pnpm installed", command: "pnpm --version" },
  { id: "clone", label: "Repository cloned", command: null },
  { id: "install", label: "Dependencies installed", command: "pnpm install" },
  { id: "env", label: "Environment variables configured", command: "cp .env.example .env" },
  { id: "db", label: "Database schema pushed", command: "pnpm drizzle-kit push" },
  { id: "dev", label: "Dev server running", command: "pnpm --filter @workspace/codelens-web run dev" },
];

const STORAGE_KEY = "codelens-setup-checklist";

interface Step {
  id: string;
  label: string;
  command: string | null;
}

interface Props {
  steps?: Step[];
}

export function SetupChecklist({ steps = DEFAULT_STEPS }: Props) {
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setCompleted(JSON.parse(stored));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(completed));
    } catch {
      // Ignore localStorage errors
    }
  }, [completed]);

  const toggleStep = (id: string) => {
    setCompleted((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = steps.filter((s) => completed[s.id]).length;
  const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;

  return (
    <div className="rounded-lg border border-white/10 bg-[#1E1E2E] overflow-hidden">
      {/* Header with progress */}
      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-white/80">Setup Checklist</h3>
          <span className="text-xs text-white/40 font-mono">
            {completedCount} of {steps.length}
          </span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="divide-y divide-white/5">
        {steps.map((step) => {
          const isDone = !!completed[step.id];
          return (
            <label
              key={step.id}
              className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={isDone}
                onChange={() => toggleStep(step.id)}
                className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 text-orange-500 focus:ring-orange-500/50 focus:ring-offset-0 cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <span
                  className={`text-sm transition-colors ${
                    isDone ? "text-white/30 line-through" : "text-white/70"
                  }`}
                >
                  {step.label}
                </span>
                {step.command && (
                  <code className="block mt-1 text-xs font-mono text-white/30 group-hover:text-white/40 transition-colors">
                    {step.command}
                  </code>
                )}
              </div>
            </label>
          );
        })}
      </div>

      {/* Completion state */}
      {completedCount === steps.length && steps.length > 0 && (
        <div className="px-4 py-3 bg-emerald-500/5 border-t border-emerald-500/10 text-center">
          <span className="text-sm text-emerald-400 font-medium">All set! Ready to go.</span>
        </div>
      )}
    </div>
  );
}
