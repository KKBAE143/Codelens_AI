"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

interface SharedCourse {
  ownerName: string;
  repoName: string;
}

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
  const router = useRouter();
  const token = params.token as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["shared-course", token],
    queryFn: () => fetchSharedCourse(token),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const course = data?.course ?? null;

  useEffect(() => {
    if (!course) return;
    router.replace(`/explore/${encodeURIComponent(course.ownerName)}/${encodeURIComponent(course.repoName)}`);
  }, [course, router]);

  if (isLoading || course) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div className="skeleton" style={{ width: 280, height: 24, margin: "0 auto 1rem" }} />
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Opening the upgraded course experience…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1rem", padding: "2rem" }}>
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem", color: "var(--error)", margin: 0 }}>
        {error instanceof Error ? error.message : "Course not found"}
      </h2>
      <p style={{ color: "var(--text-secondary)", textAlign: "center", maxWidth: 420 }}>
        This course may have been removed or is no longer public.
      </p>
      <Link href="/explore" className="btn-primary" style={{ textDecoration: "none" }}>
        Browse Courses
      </Link>
    </main>
  );
}
