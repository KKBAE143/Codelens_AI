"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { GenerationModal } from "@/components/GenerationModal";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { RepoPickerModal } from "@/components/RepoPickerModal";
import Link from "next/link";

const GITHUB_URL_RE = /^https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+/;

const PERSONAS = [
  { key: "vibe_coder", emoji: "🧑‍💻", label: "Vibe Coder", desc: "I built this with AI. Teach me how it actually works." },
  { key: "new_engineer", emoji: "👨‍💼", label: "New Engineer", desc: "I just joined this team. Onboard me fast." },
  { key: "product_manager", emoji: "📊", label: "Product Manager", desc: "No code. Just show me what this system does." },
  { key: "security_auditor", emoji: "🔒", label: "Security Auditor", desc: "Show me the risks and how data flows." },
] as const;

interface DemoCourse {
  repo: string;
  techs: string[];
  difficulty: string;
  time: string;
  desc: string;
  shareToken?: string;
}

const DEMOS: DemoCourse[] = [
  { repo: "vercel/next.js", techs: ["TypeScript", "React"], difficulty: "Advanced", time: "45 min", desc: "The React framework for the web" },
  { repo: "excalidraw/excalidraw", techs: ["TypeScript", "Canvas"], difficulty: "Intermediate", time: "30 min", desc: "Virtual whiteboard for sketching" },
  { repo: "calcom/cal.com", techs: ["TypeScript", "Next.js"], difficulty: "Advanced", time: "40 min", desc: "Open-source scheduling infrastructure" },
];

export default function Home() {
  const { isAuthenticated, login } = useAuth();
  const [url, setUrl] = useState("");
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<string>("");
  const [userOrgs, setUserOrgs] = useState<Array<{ slug: string; name: string }>>([]);
  const [generatingCourseId, setGeneratingCourseId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState<{ resetAt?: string } | null>(null);
  const [demoCourses, setDemoCourses] = useState<DemoCourse[]>(DEMOS);
  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [inputMode, setInputMode] = useState<"picker" | "url">("picker");

  useEffect(() => {
    if (isAuthenticated) {
      fetch("/api/org/my", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { organizations: [] }))
        .then((data) => setUserOrgs(data.organizations || []))
        .catch(() => {});
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetch("/api/courses/demos")
      .then((r) => (r.ok ? r.json() : { demos: [] }))
      .then((data) => {
        if (data.demos?.length) {
          setDemoCourses(
            DEMOS.map((d) => {
              const match = data.demos.find(
                (m: { repo: string; shareToken: string }) =>
                  `${m.repo}` === d.repo
              );
              return match ? { ...d, shareToken: match.shareToken } : d;
            })
          );
        }
      })
      .catch(() => {});
  }, []);

  const isValidUrl = GITHUB_URL_RE.test(url);
  const canSubmit = isValidUrl && selectedRole && !isSubmitting;

  const handleGenerate = useCallback(async () => {
    if (!isAuthenticated) { login(); return; }
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);
    setRateLimited(null);

    try {
      const res = await fetch("/api/courses/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          githubUrl: url,
          targetAudience: selectedRole,
          ...(selectedOrg ? { organizationSlug: selectedOrg } : {}),
        }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setRateLimited({ resetAt: data.resetAt });
        return;
      }
      if (!res.ok) throw new Error(data.error || "Failed to start generation");
      setGeneratingCourseId(data.courseId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }, [isAuthenticated, login, canSubmit, url, selectedRole, selectedOrg]);

  return (
    <>
      <main style={{ minHeight: "100vh" }}>
        {/* Hero */}
        <section className="hero-bg" style={{
          padding: "5.5rem 1.5rem 4.5rem",
          textAlign: "center",
          maxWidth: 800,
          margin: "0 auto",
        }}>
          <div style={{
            display: "inline-block",
            padding: "0.25rem 0.75rem",
            background: "var(--accent-light)",
            color: "var(--accent)",
            borderRadius: "var(--radius-full)",
            fontSize: "0.8rem",
            fontWeight: 600,
            marginBottom: "1.5rem",
          }}>
            Powered by Gemini AI
          </div>

          <h1 style={{
            fontFamily: "var(--font-heading)",
            fontSize: "clamp(2rem, 5vw, 3.25rem)",
            fontWeight: 700,
            lineHeight: 1.15,
            marginBottom: "1rem",
            color: "var(--text-primary)",
          }}>
            Turn Any Codebase Into an<br />
            <span style={{ color: "var(--accent)" }}>Interactive Course</span>
          </h1>

          <p style={{
            color: "var(--text-secondary)",
            fontSize: "1.125rem",
            maxWidth: 520,
            margin: "0 auto 2.5rem",
            lineHeight: 1.6,
          }}>
            Paste a GitHub URL and get a beautiful, AI-generated course that teaches how the code works. Supports public and private repos.
          </p>

          {isAuthenticated && (
            <div style={{
              maxWidth: 540,
              margin: "0 auto 1rem",
              display: "flex",
              justifyContent: "center",
              gap: "0.25rem",
              background: "var(--bg-secondary)",
              borderRadius: "var(--radius-sm)",
              padding: "0.25rem",
            }}>
              <button
                onClick={() => setInputMode("picker")}
                style={{
                  flex: 1,
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: inputMode === "picker" ? "white" : "transparent",
                  color: inputMode === "picker" ? "var(--text-primary)" : "var(--text-tertiary)",
                  boxShadow: inputMode === "picker" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s",
                }}
              >
                Import from GitHub
              </button>
              <button
                onClick={() => setInputMode("url")}
                style={{
                  flex: 1,
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: inputMode === "url" ? "white" : "transparent",
                  color: inputMode === "url" ? "var(--text-primary)" : "var(--text-tertiary)",
                  boxShadow: inputMode === "url" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s",
                }}
              >
                Paste URL
              </button>
            </div>
          )}

          {(!isAuthenticated || inputMode === "url") ? (
            <div style={{
              maxWidth: 540,
              margin: "0 auto 1.5rem",
              position: "relative",
            }}>
              <input
                type="url"
                placeholder="https://github.com/owner/repo"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(null); }}
                style={{
                  width: "100%",
                  padding: "0.875rem 1.25rem",
                  paddingRight: "2.5rem",
                  border: `2px solid ${error ? "var(--error)" : isValidUrl && url ? "var(--teal)" : "var(--border-color)"}`,
                  borderRadius: "var(--radius-md)",
                  fontSize: "0.95rem",
                  fontFamily: "var(--font-mono)",
                  background: "white",
                  outline: "none",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => { if (!error && !isValidUrl) (e.target as HTMLInputElement).style.borderColor = "var(--accent)"; }}
                onBlur={(e) => { if (!error && !isValidUrl) (e.target as HTMLInputElement).style.borderColor = "var(--border-color)"; }}
              />
              {isValidUrl && url && (
                <span style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--teal)",
                  fontSize: "1.25rem",
                }}>
                  ✓
                </span>
              )}
            </div>
          ) : (
            <div style={{
              maxWidth: 540,
              margin: "0 auto 1.5rem",
            }}>
              {url ? (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  border: "2px solid var(--teal)",
                  borderRadius: "var(--radius-md)",
                  background: "white",
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2">
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                  </svg>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {url.replace("https://github.com/", "")}
                  </span>
                  <button
                    onClick={() => setUrl("")}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-tertiary)",
                      fontSize: "1.1rem",
                      padding: "0.25rem",
                      lineHeight: 1,
                    }}
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowRepoPicker(true)}
                  style={{
                    width: "100%",
                    padding: "0.875rem 1.25rem",
                    border: "2px dashed var(--border-color)",
                    borderRadius: "var(--radius-md)",
                    background: "white",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    transition: "border-color 0.2s, background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent)";
                    e.currentTarget.style.background = "var(--accent-light)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-color)";
                    e.currentTarget.style.background = "white";
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                  </svg>
                  Select a repository from GitHub
                </button>
              )}
            </div>
          )}
          {error && <p style={{ color: "var(--error)", fontSize: "0.85rem", marginBottom: "1rem" }}>{error}</p>}

          {rateLimited && (
            <div style={{ marginBottom: "1rem" }}>
              <UpgradePrompt resetAt={rateLimited.resetAt} context="rate-limit" />
            </div>
          )}

          {/* Role selector */}
          <div className="role-grid" style={{
            maxWidth: 540,
            margin: "0 auto 2.5rem",
          }}>
            {PERSONAS.map((p) => (
              <button
                key={p.key}
                className="role-card"
                onClick={() => setSelectedRole(p.key)}
                style={{
                  padding: "1rem",
                  border: `2px solid ${selectedRole === p.key ? "var(--accent)" : "var(--border-color)"}`,
                  borderRadius: "var(--radius-md)",
                  background: selectedRole === p.key ? "var(--accent-light)" : "white",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  {p.emoji} {p.label}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  {p.desc}
                </div>
              </button>
            ))}
          </div>

          {isAuthenticated && userOrgs.length > 0 && (
            <div style={{ marginBottom: "0.75rem" }}>
              <select
                value={selectedOrg}
                onChange={(e) => setSelectedOrg(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.625rem 0.75rem",
                  border: "2px solid var(--border-color)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "0.85rem",
                  fontFamily: "var(--font-body)",
                  background: "white",
                  outline: "none",
                  color: selectedOrg ? "var(--text-primary)" : "var(--text-tertiary)",
                }}
              >
                <option value="">Personal (no team)</option>
                {userOrgs.map((org) => (
                  <option key={org.slug} value={org.slug}>{org.name}</option>
                ))}
              </select>
            </div>
          )}

          <button
            className="btn-primary"
            disabled={!canSubmit}
            onClick={handleGenerate}
            style={{ padding: "0.875rem 2.5rem", fontSize: "1rem" }}
          >
            {isSubmitting ? "Starting..." : isAuthenticated ? "Generate Course" : "Sign in to Generate"}
          </button>
        </section>

        {/* Demo library */}
        <section style={{
          padding: "4rem 1.5rem 5rem",
          background: "var(--bg-secondary)",
        }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <h2 style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1.75rem",
              fontWeight: 700,
              textAlign: "center",
              marginBottom: "0.5rem",
            }}>
              See What&apos;s Possible
            </h2>
            <p style={{
              textAlign: "center",
              color: "var(--text-secondary)",
              marginBottom: "2.5rem",
              fontSize: "1rem",
            }}>
              Pre-built courses from popular open-source projects
            </p>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "1.25rem",
            }}>
              {demoCourses.map((demo) => {
                const isAvailable = !!demo.shareToken;
                return (
                  <div key={demo.repo} className="card" style={{
                    background: "white",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                    opacity: isAvailable ? 1 : 0.65,
                    cursor: isAvailable ? "pointer" : "default",
                    transition: "opacity 0.2s, transform 0.2s",
                  }}
                  onClick={() => {
                    if (isAvailable) window.location.href = `/share/${demo.shareToken}`;
                  }}
                  >
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                    }}>
                      <code style={{
                        fontSize: "0.8rem",
                        background: "var(--bg-secondary)",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--text-primary)",
                        fontWeight: 500,
                      }}>
                        {demo.repo}
                      </code>
                    </div>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {demo.desc}
                    </p>
                    <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
                      {demo.techs.map((t) => (
                        <span key={t} className="badge" style={{ background: "var(--teal-light)", color: "var(--teal)" }}>
                          {t}
                        </span>
                      ))}
                      <span className="badge" style={{
                        background: demo.difficulty === "Advanced" ? "#FFF0EE" : "#FFF8E1",
                        color: demo.difficulty === "Advanced" ? "var(--accent)" : "var(--warning)",
                      }}>
                        {demo.difficulty}
                      </span>
                      <span className="badge" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
                        {demo.time}
                      </span>
                    </div>
                    {isAvailable ? (
                      <Link href={`/share/${demo.shareToken}`} className="btn-secondary" style={{
                        textAlign: "center",
                        textDecoration: "none",
                        fontSize: "0.8rem",
                        padding: "0.5rem",
                      }}
                      onClick={(e) => e.stopPropagation()}
                      >
                        View Course →
                      </Link>
                    ) : (
                      <div style={{
                        padding: "0.5rem",
                        background: "var(--bg-secondary)",
                        borderRadius: "var(--radius-sm)",
                        textAlign: "center",
                        fontSize: "0.8rem",
                        color: "var(--text-tertiary)",
                        fontWeight: 500,
                      }}>
                        Coming soon
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{
          padding: "2rem 1.5rem",
          textAlign: "center",
          borderTop: "1px solid var(--border-color)",
        }}>
          <p style={{ color: "var(--text-tertiary)", fontSize: "0.8rem" }}>
            <span style={{ color: "var(--accent)", fontWeight: 600 }}>◉ CodeLens AI</span>
            {" "}— Powered by Gemini AI
          </p>
        </footer>
      </main>

      {generatingCourseId && (
        <GenerationModal
          courseId={generatingCourseId}
          onClose={() => setGeneratingCourseId(null)}
        />
      )}

      {showRepoPicker && (
        <RepoPickerModal
          onSelect={(repoUrl) => {
            setUrl(repoUrl);
            setShowRepoPicker(false);
          }}
          onClose={() => setShowRepoPicker(false)}
        />
      )}
    </>
  );
}
