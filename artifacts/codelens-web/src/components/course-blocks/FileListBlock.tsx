"use client";

import type { V2FileListBlock } from "@/lib/course-types";

export function FileListBlock({ block }: { block: V2FileListBlock }) {
  return (
    <div className="v2-filelist">
      <div className="v2-filelist-header">
        <span className="v2-filelist-icon">Files</span>
        <span className="v2-filelist-count">{block.files.length} files</span>
      </div>
      <div className="v2-filelist-items">
        {block.files.map((f) => (
          <div key={f.path} className="v2-filelist-item">
            <div className="v2-filelist-path">
              {f.githubUrl ? (
                <a href={f.githubUrl} target="_blank" rel="noopener noreferrer">{f.path}</a>
              ) : (
                <span>{f.path}</span>
              )}
              {f.lineCount && <span className="v2-filelist-lines">{f.lineCount} lines</span>}
            </div>
            <p className="v2-filelist-role">{f.role}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
