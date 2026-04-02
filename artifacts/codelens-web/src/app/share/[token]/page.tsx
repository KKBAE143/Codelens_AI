"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

interface SharedCourse {
  id: string;
  repoName: string;
  ownerName: string;
  targetAudience: string;
  techStack: { languages: string[]; frameworks: string[] } | null;
  oneLiner: string | null;
  difficulty: string | null;
  estimatedMinutes: number | null;
  moduleCount: number | null;
  html: string;
  version: number;
}

const AUDIENCE_LABELS: Record<string, string> = {
  vibe_coder: "Vibe Coder",
  new_engineer: "New Engineer",
  product_manager: "PM",
  security_auditor: "Security",
};

async function fetchSharedCourse(token: string): Promise<{ course: SharedCourse }> {
  const res = await fetch(`/api/courses/share/${token}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Not found" }));
    throw new Error(data.error || "Course not found");
  }
  return res.json();
}

export default function SharedCourseViewer() {
  const params = useParams();
  const token = params.token as string;
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["shared-course", token],
    queryFn: () => fetchSharedCourse(token),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const course = data?.course ?? null;

  useEffect(() => {
    if (!course?.html) return;
    const url = URL.createObjectURL(new Blob([course.html], { type: "text/html" }));
    setIframeSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [course?.html]);

  if (isLoading) {
    return (
      <main style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <div style={{ textAlign: "center" }}>
          <div className="skeleton" style={{ width: 300, height: 24, margin: "0 auto 1rem" }} />
          <div className="skeleton" style={{ width: 200, height: 16, margin: "0 auto" }} />
        </div>
      </main>
    );
  }

  if (error || !course) {
    return (
      <main style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "1rem",
      }}>
        <h2 style={{
          fontFamily: "var(--font-heading)",
          fontSize: "1.5rem",
          color: "var(--error)",
        }}>
          {error instanceof Error ? error.message : "Course not found"}
        </h2>
        <p style={{ color: "var(--text-secondary)" }}>
          This course may have been removed or is no longer public.
        </p>
        <Link href="/" className="btn-primary" style={{ textDecoration: "none" }}>
          Create Your Own Course
        </Link>
      </main>
    );
  }

  if (!course.html || !iframeSrc) {
    return (
      <main style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <p style={{ color: "var(--text-secondary)" }}>Course content is not available.</p>
      </main>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div className="share-cta-banner" style={{
        height: 32,
        background: "var(--accent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        flexShrink: 0,
      }}>
        <span style={{ color: "white", fontSize: "0.8rem" }}>
          Powered by CodeLens AI — Generate a course for your own codebase
        </span>
        <Link href="/" style={{
          color: "white",
          fontSize: "0.8rem",
          fontWeight: 600,
          textDecoration: "underline",
        }}>
          Try it free →
        </Link>
      </div>

      <div className="share-topbar" style={{
        height: 48,
        background: "var(--code-bg)",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 1rem",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Link href="/" style={{
            color: "rgba(255,255,255,0.7)",
            textDecoration: "none",
            fontSize: "0.85rem",
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
          }}>
            <span style={{ color: "var(--accent)" }}>◉</span> CodeLens AI
          </Link>
          <span style={{ color: "rgba(255,255,255,0.3)" }}>|</span>
          <code style={{
            fontSize: "0.85rem",
            color: "rgba(255,255,255,0.9)",
            fontFamily: "var(--font-mono)",
          }}>
            {course.ownerName}/{course.repoName}
          </code>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem" }}>
          <span style={{
            background: "rgba(255,255,255,0.15)",
            padding: "0.125rem 0.5rem",
            borderRadius: "var(--radius-full)",
            color: "rgba(255,255,255,0.7)",
          }}>
            {AUDIENCE_LABELS[course.targetAudience] || course.targetAudience}
          </span>
          {course.difficulty && (
            <span style={{
              background: "rgba(255,255,255,0.15)",
              padding: "0.125rem 0.5rem",
              borderRadius: "var(--radius-full)",
              color: "rgba(255,255,255,0.7)",
            }}>
              {course.difficulty}
            </span>
          )}
          {course.estimatedMinutes && (
            <span style={{ color: "rgba(255,255,255,0.5)" }}>
              ~{course.estimatedMinutes} min
            </span>
          )}
          {course.moduleCount && (
            <span style={{ color: "rgba(255,255,255,0.5)" }}>
              {course.moduleCount} modules
            </span>
          )}
          <Link href="/" className="btn-primary" style={{
            padding: "0.25rem 0.625rem",
            fontSize: "0.75rem",
            textDecoration: "none",
          }}>
            Create Yours
          </Link>
        </div>
      </div>

      <iframe
        src={iframeSrc}
        sandbox="allow-scripts allow-same-origin"
        style={{ flex: 1, border: "none", background: "white" }}
        title={`${course.ownerName}/${course.repoName} Shared Course`}
      />
    </div>
  );
}
