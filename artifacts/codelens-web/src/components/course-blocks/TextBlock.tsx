"use client";

import { useState, useEffect, useCallback } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { V2TextBlock } from "@/lib/course-types";

interface LightboxState {
  src: string;
  alt: string;
}

function CloseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function TextBlock({ block }: { block: V2TextBlock }) {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  const closeLightbox = useCallback(() => setLightbox(null), []);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeLightbox(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [lightbox, closeLightbox]);

  const components: Components = {
    img(props) {
      const { src, alt, title } = props;
      if (!src || typeof src !== "string") return null;
      const altText = typeof alt === "string" ? alt : "";
      const titleText = typeof title === "string" ? title : undefined;
      const label = altText || titleText || "Click to enlarge image";
      return (
        <span className="v2-text-img-wrapper">
          <button
            className="v2-text-img-btn"
            onClick={() => setLightbox({ src, alt: altText || titleText || "" })}
            aria-label={`Enlarge: ${label}`}
            title={titleText ?? "Click to enlarge"}
            type="button"
          >
            <img src={src} alt={altText} title={titleText} className="v2-text-img" />
          </button>
        </span>
      );
    },
  };

  return (
    <>
      <div className="v2-text-block">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {block.content}
        </ReactMarkdown>
      </div>

      {lightbox && (
        <div
          className="v2-image-lightbox-overlay"
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Image lightbox"
        >
          <button
            type="button"
            className="v2-image-lightbox-close"
            onClick={closeLightbox}
            aria-label="Close lightbox"
          >
            <CloseIcon />
          </button>
          <div className="v2-image-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.src} alt={lightbox.alt} className="v2-image-lightbox-img" />
            {lightbox.alt && <p className="v2-image-lightbox-caption">{lightbox.alt}</p>}
          </div>
        </div>
      )}
    </>
  );
}
