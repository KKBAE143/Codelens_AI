"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { V2TextBlock } from "@/lib/course-types";

export function TextBlock({ block }: { block: V2TextBlock }) {
  return (
    <div className="v2-text-block">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {block.content}
      </ReactMarkdown>
    </div>
  );
}
