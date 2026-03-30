"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/Toast";

const AUDIENCE_LABELS: Record<string, string> = {
  vibe_coder: "Vibe Coder",
  new_engineer: "New Engineer",
  product_manager: "PM",
  security_auditor: "Security",
};

interface ChangesSince {
  summary: string;
  changedFiles: string[];
  addedFiles: string[];
  modifiedFiles: string[];
  removedFiles: string[];
  previousVersionId: string;
  detectedAt: string;
}

interface WebhookInfo {
  autoRegenerate: boolean;
  lastTriggeredAt: string | null;
}

interface CourseData {
  id: string;
  repoName: string;
  ownerName: string;
  githubUrl: string;
  targetAudience: string;
  techStack: { languages: string[]; frameworks: string[] } | null;
  oneLiner: string | null;
  difficulty: string | null;
  estimatedMinutes: number | null;
  moduleCount: number | null;
  html: string;
  version: number;
  changesSince: ChangesSince | null;
  shareToken: string | null;
  isPublic: boolean;
  createdBy: string;
}

async function fetchCourse(id: string): Promise<{ course: CourseData; webhook: WebhookInfo | null }> {
  const res = await fetch(`/api/courses/${id}`, { credentials: "include" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Course not found" }));
    throw new Error(data.error || "Course not found");
  }
  return res.json();
}

export default function CourseViewer() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading, login } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [completedModules, setCompletedModules] = useState<number[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [webhookToggling, setWebhookToggling] = useState(false);
  const [lastSeenVersion, setLastSeenVersion] = useState<number | null>(null);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const moduleCountRef = useRef(0);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) login();
  }, [authLoading, isAuthenticated, login]);

  const courseId = params.id as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => fetchCourse(courseId),
    enabled: isAuthenticated && !!courseId,
  });

  const course = data?.course ?? null;
  const webhookInfo = data?.webhook ?? null;

  useEffect(() => {
    if (course) {
      moduleCountRef.current = course.moduleCount || 0;
      document.title = `${course.ownerName}/${course.repoName} — CodeLens AI`;
    }
  }, [course]);

  useEffect(() => {
    if (!courseId || !isAuthenticated) return;
    fetch(`/api/courses/${courseId}/progress`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((progressData) => {
        if (progressData?.completedModules?.length) {
          setCompletedModules(progressData.completedModules);
        }
        setLastSeenVersion(typeof progressData?.lastSeenVersion === "number" ? progressData.lastSeenVersion : 0);
      })
      .catch(() => {});
  }, [courseId, isAuthenticated]);

  useEffect(() => {
    if (course && lastSeenVersion !== null && course.version > lastSeenVersion && course.changesSince) {
      setShowWhatsNew(true);
    }
  }, [course, lastSeenVersion]);

  useEffect(() => {
    if (!course?.html) return;
    const url = URL.createObjectURL(new Blob([course.html], { type: "text/html" }));
    setIframeSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [course?.html]);

  const handleMessage = useCallback((event: MessageEvent) => {
    if (iframeRef.current && event.source !== iframeRef.current.contentWindow) return;
    if (!event.data || typeof event.data !== "object") return;

    if (event.data.type === "moduleComplete" && typeof event.data.moduleIndex === "number") {
      const moduleIndex = event.data.moduleIndex;
      setCompletedModules((prev) => {
        if (prev.includes(moduleIndex)) return prev;
        const updated = [...prev, moduleIndex];

        fetch(`/api/courses/${courseId}/progress`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ moduleIndex, totalModules: moduleCountRef.current }),
        }).catch(() => {});

        return updated;
      });
    }
  }, [courseId]);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  const handleCopyShare = () => {
    if (course?.shareToken) {
      const url = `${window.location.origin}/share/${course.shareToken}`;
      navigator.clipboard.writeText(url);
      showToast("Share link copied!", "success");
    }
  };

  const handleDismissWhatsNew = async () => {
    if (!course) return;
    setShowWhatsNew(false);
    setLastSeenVersion(course.version);
    try {
      await fetch(`/api/courses/${courseId}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ markVersionSeen: course.version }),
      });
    } catch {}
  };

  const handleToggleWebhook = async () => {
    if (!course || webhookToggling) return;
    setWebhookToggling(true);
    try {
      const newState = !webhookInfo?.autoRegenerate;
      const res = await fetch(`/api/courses/${courseId}/webhook`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: newState }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as Record<string, string>).error || "Failed to update auto-update");
      }
      showToast(newState ? "Auto-updates enabled" : "Auto-updates disabled", "success");
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to toggle auto-updates", "error");
    } finally {
      setWebhookToggling(false);
    }
  };

  if (isLoading || authLoading) {
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

  if (error) {
    return (
      <main style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "1rem",
      }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem", color: "var(--error)" }}>
          {error instanceof Error ? error.message : "Failed to load course"}
        </h2>
        <button className="btn-secondary" onClick={() => router.push("/dashboard")}>
          Back to Dashboard
        </button>
      </main>
    );
  }

  if (!course || !course.html || !iframeSrc) {
    return (
      <main style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <p style={{ color: "var(--text-secondary)" }}>Course content is not available yet.</p>
      </main>
    );
  }

  const progress = course.moduleCount
    ? Math.round((completedModules.length / course.moduleCount) * 100)
    : 0;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div className="course-topbar" style={{
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
          <button
            onClick={() => router.push("/dashboard")}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              fontFamily: "var(--font-body)",
            }}
          >
            ← Dashboard
          </button>
          <span style={{ color: "rgba(255,255,255,0.3)" }}>|</span>
          <code style={{
            fontSize: "0.85rem",
            color: "rgba(255,255,255,0.9)",
            fontFamily: "var(--font-mono)",
          }}>
            {course.ownerName}/{course.repoName}
          </code>
          {course.version > 1 && (
            <span style={{
              background: "rgba(46,125,50,0.3)",
              color: "#A5D6A7",
              padding: "0.1rem 0.4rem",
              borderRadius: "var(--radius-full)",
              fontSize: "0.7rem",
              fontWeight: 600,
            }}>
              v{course.version}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{
            background: "rgba(255,255,255,0.15)",
            padding: "0.125rem 0.5rem",
            borderRadius: "var(--radius-full)",
            color: "rgba(255,255,255,0.7)",
            fontSize: "0.75rem",
          }}>
            {AUDIENCE_LABELS[course.targetAudience] || course.targetAudience}
          </span>
          {course.difficulty && (
            <span style={{
              background: "rgba(255,255,255,0.15)",
              padding: "0.125rem 0.5rem",
              borderRadius: "var(--radius-full)",
              color: "rgba(255,255,255,0.7)",
              fontSize: "0.75rem",
            }}>
              {course.difficulty}
            </span>
          )}
          {course.estimatedMinutes && (
            <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)" }}>
              ~{course.estimatedMinutes} min
            </span>
          )}
          {course.moduleCount && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{
                width: 100,
                height: 4,
                background: "rgba(255,255,255,0.2)",
                borderRadius: 2,
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${progress}%`,
                  background: "var(--teal)",
                  borderRadius: 2,
                  transition: "width 0.3s ease",
                }} />
              </div>
              <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.6)" }}>
                {completedModules.length}/{course.moduleCount}
              </span>
            </div>
          )}
          {course.shareToken && (
            <button
              onClick={handleCopyShare}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "white",
                padding: "0.25rem 0.5rem",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontSize: "0.75rem",
                fontFamily: "var(--font-body)",
              }}
            >
              Share
            </button>
          )}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "none",
              color: "white",
              padding: "0.25rem 0.5rem",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              fontSize: "0.8rem",
              fontFamily: "var(--font-body)",
            }}
          >
            {showSidebar ? "Hide Info" : "Show Info"}
          </button>
        </div>
      </div>

      {showWhatsNew && course.changesSince && (
        <div style={{
          background: "linear-gradient(90deg, #E8F5E9, #C8E6C9)",
          padding: "0.75rem 1rem",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "1rem",
          borderBottom: "1px solid #A5D6A7",
          flexShrink: 0,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: "0.8rem",
              fontWeight: 600,
              color: "#2E7D32",
              marginBottom: "0.25rem",
              fontFamily: "var(--font-heading)",
            }}>
              What&apos;s new in version {course.version}
            </div>
            <p style={{ fontSize: "0.8rem", color: "#388E3C", lineHeight: 1.4, margin: 0 }}>
              {course.changesSince.summary}
            </p>
            {course.changesSince.changedFiles.length > 0 && (
              <details style={{ fontSize: "0.75rem", color: "#43A047", marginTop: "0.375rem" }}>
                <summary style={{ cursor: "pointer" }}>
                  {course.changesSince.changedFiles.length} files changed
                </summary>
                <div style={{ marginTop: "0.375rem", fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>
                  {(course.changesSince.addedFiles?.length ?? 0) > 0 && (
                    <div style={{ marginBottom: "0.25rem" }}>
                      <span style={{ color: "#2E7D32", fontWeight: 600 }}>Added:</span>
                      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginTop: "0.125rem" }}>
                        {course.changesSince.addedFiles.map((f) => (
                          <span key={f} style={{ background: "rgba(46,125,50,0.15)", padding: "0.1rem 0.35rem", borderRadius: 3 }}>{f}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(course.changesSince.modifiedFiles?.length ?? 0) > 0 && (
                    <div style={{ marginBottom: "0.25rem" }}>
                      <span style={{ color: "#E65100", fontWeight: 600 }}>Modified:</span>
                      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginTop: "0.125rem" }}>
                        {course.changesSince.modifiedFiles.map((f) => (
                          <span key={f} style={{ background: "rgba(230,81,0,0.1)", padding: "0.1rem 0.35rem", borderRadius: 3 }}>{f}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(course.changesSince.removedFiles?.length ?? 0) > 0 && (
                    <div>
                      <span style={{ color: "#C62828", fontWeight: 600 }}>Removed:</span>
                      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginTop: "0.125rem" }}>
                        {course.changesSince.removedFiles.map((f) => (
                          <span key={f} style={{ background: "rgba(198,40,40,0.1)", padding: "0.1rem 0.35rem", borderRadius: 3 }}>{f}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
          <button
            onClick={handleDismissWhatsNew}
            style={{
              background: "#2E7D32",
              color: "white",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "0.375rem 0.75rem",
              fontSize: "0.8rem",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          sandbox="allow-scripts allow-same-origin"
          style={{
            flex: 1,
            border: "none",
            background: "white",
          }}
          title={`${course.ownerName}/${course.repoName} Course`}
        />

        {showSidebar && (
          <aside className="course-sidebar" style={{
            width: 280,
            background: "var(--bg-primary)",
            borderLeft: "1px solid var(--border-color)",
            padding: "1.25rem",
            overflowY: "auto",
            flexShrink: 0,
          }}>
            <h3 style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1rem",
              fontWeight: 600,
              marginBottom: "0.75rem",
            }}>
              Course Info
            </h3>

            {course.oneLiner && (
              <p style={{
                fontSize: "0.85rem",
                color: "var(--text-secondary)",
                lineHeight: 1.5,
                marginBottom: "1rem",
              }}>
                {course.oneLiner}
              </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.25rem" }}>
              {course.difficulty && (
                <div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", marginBottom: "0.125rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Difficulty
                  </div>
                  <div style={{ fontSize: "0.85rem" }}>{course.difficulty}</div>
                </div>
              )}
              {course.estimatedMinutes && (
                <div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", marginBottom: "0.125rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Duration
                  </div>
                  <div style={{ fontSize: "0.85rem" }}>~{course.estimatedMinutes} minutes</div>
                </div>
              )}
              {course.moduleCount && (
                <div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", marginBottom: "0.125rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Progress
                  </div>
                  <div style={{ fontSize: "0.85rem" }}>
                    {completedModules.length} / {course.moduleCount} modules
                  </div>
                </div>
              )}
            </div>

            {course.techStack && (
              <div style={{ marginBottom: "1.25rem" }}>
                <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", marginBottom: "0.375rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Tech Stack
                </div>
                <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                  {[...(course.techStack.languages || []), ...(course.techStack.frameworks || [])].map((t) => (
                    <span key={t} className="badge" style={{ background: "var(--teal-light)", color: "var(--teal)" }}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {course.version > 1 && (
              <div style={{
                marginBottom: "1.25rem",
                padding: "0.625rem",
                background: "#E8F5E9",
                border: "1px solid #C8E6C9",
                borderRadius: "var(--radius-sm)",
              }}>
                <div style={{
                  fontSize: "0.7rem",
                  color: "#2E7D32",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  fontWeight: 600,
                  marginBottom: "0.375rem",
                }}>
                  Version {course.version}
                </div>
                {course.changesSince && (
                  <>
                    <p style={{
                      fontSize: "0.8rem",
                      color: "#2E7D32",
                      lineHeight: 1.4,
                      marginBottom: "0.5rem",
                    }}>
                      {course.changesSince.summary}
                    </p>
                    {course.changesSince.changedFiles.length > 0 && (
                      <details style={{ fontSize: "0.75rem", color: "#388E3C" }}>
                        <summary style={{ cursor: "pointer", marginBottom: "0.25rem" }}>
                          {course.changesSince.changedFiles.length} files changed
                        </summary>
                        <div style={{
                          maxHeight: 150,
                          overflowY: "auto",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.7rem",
                          lineHeight: 1.6,
                        }}>
                          {(course.changesSince.addedFiles?.length ?? 0) > 0 && (
                            <div style={{ marginBottom: "0.25rem" }}>
                              <div style={{ color: "#2E7D32", fontWeight: 600, fontSize: "0.65rem" }}>Added</div>
                              {course.changesSince.addedFiles.map((f) => (
                                <div key={f} style={{ color: "#2E7D32" }}>+ {f}</div>
                              ))}
                            </div>
                          )}
                          {(course.changesSince.modifiedFiles?.length ?? 0) > 0 && (
                            <div style={{ marginBottom: "0.25rem" }}>
                              <div style={{ color: "#E65100", fontWeight: 600, fontSize: "0.65rem" }}>Modified</div>
                              {course.changesSince.modifiedFiles.map((f) => (
                                <div key={f} style={{ color: "#E65100" }}>~ {f}</div>
                              ))}
                            </div>
                          )}
                          {(course.changesSince.removedFiles?.length ?? 0) > 0 && (
                            <div>
                              <div style={{ color: "#C62828", fontWeight: 600, fontSize: "0.65rem" }}>Removed</div>
                              {course.changesSince.removedFiles.map((f) => (
                                <div key={f} style={{ color: "#C62828" }}>- {f}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                  </>
                )}
              </div>
            )}

            {user && course.createdBy === user.id && (
              <div style={{
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.5rem 0.625rem",
                background: "var(--bg-secondary)",
                borderRadius: "var(--radius-sm)",
              }}>
                <div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 500 }}>Auto-update</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>
                    Regenerate on push
                  </div>
                </div>
                <button
                  onClick={handleToggleWebhook}
                  disabled={webhookToggling}
                  style={{
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    border: "none",
                    cursor: webhookToggling ? "wait" : "pointer",
                    background: webhookInfo?.autoRegenerate ? "var(--teal)" : "var(--border-color)",
                    position: "relative",
                    transition: "background 0.2s ease",
                  }}
                >
                  <div style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "white",
                    position: "absolute",
                    top: 3,
                    left: webhookInfo?.autoRegenerate ? 23 : 3,
                    transition: "left 0.2s ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </button>
              </div>
            )}

            <a
              href={course.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              style={{ width: "100%", justifyContent: "center", textDecoration: "none", fontSize: "0.85rem" }}
            >
              View on GitHub ↗
            </a>
          </aside>
        )}
      </div>
    </div>
  );
}
