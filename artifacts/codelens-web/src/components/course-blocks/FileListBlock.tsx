"use client";

import type { V2FileListBlock } from "@/lib/course-types";

function getFileIcon(path: string): { icon: string; color: string } {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const name = path.split("/").pop()?.toLowerCase() || "";

  if (name === "dockerfile" || name.startsWith("docker")) return { icon: "🐳", color: "#2496ED" };
  if (name === "makefile") return { icon: "⚙️", color: "#6B6B69" };
  if (name === ".env" || name.startsWith(".env")) return { icon: "🔑", color: "#EAB308" };
  if (name === "package.json") return { icon: "📦", color: "#CB3837" };
  if (name === "readme.md" || name === "readme") return { icon: "📖", color: "#3B82F6" };

  const iconMap: Record<string, { icon: string; color: string }> = {
    ts: { icon: "TS", color: "#3178C6" },
    tsx: { icon: "TX", color: "#3178C6" },
    js: { icon: "JS", color: "#F7DF1E" },
    jsx: { icon: "JX", color: "#F7DF1E" },
    py: { icon: "PY", color: "#3776AB" },
    rs: { icon: "RS", color: "#DEA584" },
    go: { icon: "GO", color: "#00ADD8" },
    java: { icon: "JV", color: "#ED8B00" },
    rb: { icon: "RB", color: "#CC342D" },
    php: { icon: "PH", color: "#777BB4" },
    css: { icon: "CS", color: "#264DE4" },
    scss: { icon: "SC", color: "#CF649A" },
    html: { icon: "HT", color: "#E34F26" },
    json: { icon: "{}", color: "#6B6B69" },
    yaml: { icon: "YM", color: "#CB171E" },
    yml: { icon: "YM", color: "#CB171E" },
    toml: { icon: "TM", color: "#9C4221" },
    md: { icon: "MD", color: "#083FA1" },
    sql: { icon: "SQ", color: "#336791" },
    sh: { icon: "$_", color: "#4EAA25" },
    bash: { icon: "$_", color: "#4EAA25" },
    swift: { icon: "SW", color: "#FA7343" },
    kt: { icon: "KT", color: "#7F52FF" },
    dart: { icon: "DT", color: "#0175C2" },
    c: { icon: "C_", color: "#A8B9CC" },
    cpp: { icon: "C+", color: "#00599C" },
    h: { icon: "H_", color: "#A8B9CC" },
    xml: { icon: "XM", color: "#E34F26" },
    svg: { icon: "SV", color: "#FFB13B" },
    graphql: { icon: "GQ", color: "#E10098" },
    proto: { icon: "PB", color: "#4285F4" },
    lock: { icon: "🔒", color: "#6B6B69" },
  };

  return iconMap[ext] || { icon: "📄", color: "#6B6B69" };
}

function ExternalLink() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function FileListBlock({ block }: { block: V2FileListBlock }) {
  return (
    <div className="v2-filelist">
      <div className="v2-filelist-header">
        <span className="v2-filelist-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: 4 }}>
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Files
        </span>
        <span className="v2-filelist-count">{block.files.length} files</span>
      </div>
      <div className="v2-filelist-items">
        {block.files.map((f) => {
          const { icon, color } = getFileIcon(f.path);
          const isEmoji = icon.length > 2;
          return (
            <div key={f.path} className="v2-filelist-item">
              <div className="v2-filelist-path">
                {isEmoji ? (
                  <span className="v2-filelist-file-icon-emoji">{icon}</span>
                ) : (
                  <span className="v2-filelist-file-icon" style={{ background: color, color: "white" }}>
                    {icon}
                  </span>
                )}
                {f.githubUrl ? (
                  <a href={f.githubUrl} target="_blank" rel="noopener noreferrer">
                    {f.path} <ExternalLink />
                  </a>
                ) : (
                  <span>{f.path}</span>
                )}
                {f.lineCount != null && <span className="v2-filelist-lines">{f.lineCount} lines</span>}
              </div>
              <p className="v2-filelist-role">{f.role}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
