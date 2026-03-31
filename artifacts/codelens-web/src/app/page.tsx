"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { CourseWizardModal } from "@/components/CourseWizardModal";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { RepoPickerModal } from "@/components/RepoPickerModal";
import Link from "next/link";

const GITHUB_URL_RE =
  /^https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+/;

interface RepoPreview {
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  language: string | null;
  avatar: string;
}

interface ExistingCourseInfo {
  id: string;
  repoName: string;
  ownerName: string;
  estimatedMinutes: number | null;
  moduleCount: number | null;
  oneLiner: string | null;
  updatedAt: string;
  exploreUrl: string;
}

interface FeaturedCourse {
  id: string;
  repoName: string;
  ownerName: string;
  oneLiner: string | null;
  difficulty: string | null;
  estimatedMinutes: number | null;
  moduleCount: number | null;
  techStack: { languages: string[]; frameworks: string[] } | null;
  stars: number | null;
  viewCount: number;
  updatedAt: string;
  targetAudience: string;
}

interface DemoCourse {
  repo: string;
  techs: string[];
  difficulty: string;
  time: string;
  desc: string;
  shareToken?: string;
}

const DEMOS: DemoCourse[] = [
  {
    repo: "vercel/next.js",
    techs: ["TypeScript", "React"],
    difficulty: "Advanced",
    time: "45 min",
    desc: "The React framework for the web",
  },
  {
    repo: "excalidraw/excalidraw",
    techs: ["TypeScript", "Canvas"],
    difficulty: "Intermediate",
    time: "30 min",
    desc: "Virtual whiteboard for sketching",
  },
  {
    repo: "calcom/cal.com",
    techs: ["TypeScript", "Next.js"],
    difficulty: "Advanced",
    time: "40 min",
    desc: "Open-source scheduling infrastructure",
  },
];

export default function Home() {
  const { isAuthenticated, login } = useAuth();
  const searchParams = useSearchParams();
  const [url, setUrl] = useState(searchParams.get("repo") || "");
  const [selectedOrg, setSelectedOrg] = useState<string>("");
  const [userOrgs, setUserOrgs] = useState<
    Array<{ slug: string; name: string }>
  >([]);
  const [showWizard, setShowWizard] = useState(false);
  const [rateLimited, setRateLimited] = useState<{ resetAt?: string } | null>(
    null,
  );
  const [demoCourses, setDemoCourses] = useState<DemoCourse[]>(DEMOS);
  const [featuredCourses, setFeaturedCourses] = useState<FeaturedCourse[]>([]);
  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [inputMode, setInputMode] = useState<"picker" | "url">("picker");
  const [repoPreview, setRepoPreview] = useState<RepoPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [existingCourse, setExistingCourse] =
    useState<ExistingCourseInfo | null>(null);

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
                  `${m.repo}` === d.repo,
              );
              return match ? { ...d, shareToken: match.shareToken } : d;
            }),
          );
        }
      })
      .catch(() => {});

    fetch("/api/courses/featured")
      .then((r) => (r.ok ? r.json() : { courses: [] }))
      .then((data) => {
        if (data.courses?.length) {
          setFeaturedCourses(data.courses);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!GITHUB_URL_RE.test(url)) {
      setRepoPreview(null);
      setPreviewLoading(false);
      setExistingCourse(null);
      return;
    }
    const match = url.match(/github\.com\/([^/]+)\/([^/\s?#]+)/);
    if (!match) return;

    setRepoPreview(null);
    setExistingCourse(null);
    const controller = new AbortController();

    const timer = setTimeout(() => {
      setPreviewLoading(true);

      Promise.all([
        fetch(
          `/api/github/repo?repo=${encodeURIComponent(`${match[1]}/${match[2].replace(/\.git$/, "")}`)}`,
          {
            signal: controller.signal,
            credentials: "include",
          },
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch(`/api/courses/check-existing?url=${encodeURIComponent(url)}`, {
          signal: controller.signal,
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ])
        .then(([ghData, existingData]) => {
          if (ghData) {
            setRepoPreview({
              name: ghData.name,
              fullName: ghData.full_name,
              description: ghData.description,
              stars: ghData.stargazers_count,
              language: ghData.language,
              avatar: ghData.owner?.avatar_url || "",
            });
          }
          if (existingData?.exists && existingData.course) {
            setExistingCourse({
              ...existingData.course,
              exploreUrl: existingData.exploreUrl,
            });
          }
        })
        .finally(() => setPreviewLoading(false));
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [url]);

  const isValidUrl = GITHUB_URL_RE.test(url);

  const handleOpenWizard = useCallback(() => {
    if (!isAuthenticated) {
      login();
      return;
    }
    if (!isValidUrl) return;
    setShowWizard(true);
  }, [isAuthenticated, login, isValidUrl]);

  return (
    <>
      <main style={{ minHeight: "100vh" }}>
        <section
          className="hero-bg"
          style={{
            padding: "5.5rem 1.5rem 4.5rem",
            textAlign: "center",
            maxWidth: 800,
            margin: "0 auto",
          }}
        >
          <div
            style={{
              display: "inline-block",
              padding: "0.25rem 0.75rem",
              background: "var(--accent-light)",
              color: "var(--accent)",
              borderRadius: "var(--radius-full)",
              fontSize: "0.8rem",
              fontWeight: 600,
              marginBottom: "1.5rem",
            }}
          >
            Powered by Gemini AI
          </div>

          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(2rem, 5vw, 3.25rem)",
              fontWeight: 700,
              lineHeight: 1.15,
              marginBottom: "1rem",
              color: "var(--text-primary)",
            }}
          >
            Turn Any Codebase Into an
            <br />
            <span style={{ color: "var(--accent)" }}>Interactive Course</span>
          </h1>

          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: "1.125rem",
              maxWidth: 520,
              margin: "0 auto 2.5rem",
              lineHeight: 1.6,
            }}
          >
            Paste a GitHub URL and get a beautiful, AI-generated course that
            teaches how the code works. Supports public and private repos.
          </p>

          {isAuthenticated && (
            <div
              style={{
                maxWidth: 540,
                margin: "0 auto 1rem",
                display: "flex",
                justifyContent: "center",
                gap: "0.25rem",
                background: "var(--bg-secondary)",
                borderRadius: "var(--radius-sm)",
                padding: "0.25rem",
              }}
            >
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
                  color:
                    inputMode === "picker"
                      ? "var(--text-primary)"
                      : "var(--text-tertiary)",
                  boxShadow:
                    inputMode === "picker"
                      ? "0 1px 3px rgba(0,0,0,0.08)"
                      : "none",
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
                  color:
                    inputMode === "url"
                      ? "var(--text-primary)"
                      : "var(--text-tertiary)",
                  boxShadow:
                    inputMode === "url" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s",
                }}
              >
                Paste URL
              </button>
            </div>
          )}

          {!isAuthenticated || inputMode === "url" ? (
            <div
              style={{
                maxWidth: 540,
                margin: "0 auto 1rem",
                position: "relative",
              }}
            >
              <input
                type="url"
                placeholder="https://github.com/owner/repo"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.875rem 1.25rem",
                  paddingRight: "2.5rem",
                  border: `2px solid ${isValidUrl && url ? "var(--teal)" : "var(--border-color)"}`,
                  borderRadius: "var(--radius-md)",
                  fontSize: "0.95rem",
                  fontFamily: "var(--font-mono)",
                  background: "white",
                  outline: "none",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => {
                  if (!isValidUrl)
                    (e.target as HTMLInputElement).style.borderColor =
                      "var(--accent)";
                }}
                onBlur={(e) => {
                  if (!isValidUrl)
                    (e.target as HTMLInputElement).style.borderColor =
                      "var(--border-color)";
                }}
              />
              {isValidUrl && url && (
                <span
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--teal)",
                    fontSize: "1.25rem",
                  }}
                >
                  {"\u2713"}
                </span>
              )}
            </div>
          ) : (
            <div style={{ maxWidth: 540, margin: "0 auto 1rem" }}>
              {url ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.75rem 1rem",
                    border: "2px solid var(--teal)",
                    borderRadius: "var(--radius-md)",
                    background: "white",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--teal)"
                    strokeWidth="2"
                  >
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                  </svg>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.9rem",
                      fontWeight: 600,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {url.replace("https://github.com/", "")}
                  </span>
                  <button
                    onClick={() => {
                      setUrl("");
                      setRepoPreview(null);
                    }}
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
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                  </svg>
                  Select a repository from GitHub
                </button>
              )}
            </div>
          )}

          {isValidUrl && repoPreview && (
            <div style={{ maxWidth: 540, margin: "0 auto 1.5rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.875rem 1rem",
                  background: "white",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-md)",
                  textAlign: "left",
                }}
              >
                <img
                  src={repoPreview.avatar}
                  alt=""
                  style={{ width: 36, height: 36, borderRadius: "50%" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                    }}
                  >
                    {repoPreview.fullName}
                  </div>
                  {repoPreview.description && (
                    <p
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        lineHeight: 1.4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {repoPreview.description}
                    </p>
                  )}
                </div>
                <div
                  style={{ display: "flex", gap: "0.375rem", flexShrink: 0 }}
                >
                  {repoPreview.language && (
                    <span
                      className="badge"
                      style={{
                        background: "var(--teal-light)",
                        color: "var(--teal)",
                      }}
                    >
                      {repoPreview.language}
                    </span>
                  )}
                  <span
                    className="badge"
                    style={{
                      background: "var(--bg-secondary)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {repoPreview.stars.toLocaleString()} stars
                  </span>
                </div>
              </div>
            </div>
          )}

          {previewLoading && isValidUrl && !repoPreview && (
            <div style={{ maxWidth: 540, margin: "0 auto 1.5rem" }}>
              <div
                className="skeleton"
                style={{ height: 56, borderRadius: "var(--radius-md)" }}
              />
            </div>
          )}

          {existingCourse && (
            <div
              style={{
                maxWidth: 540,
                margin: "0 auto 1.5rem",
                padding: "0.875rem 1rem",
                background: "var(--teal-light)",
                border: "1px solid var(--teal)",
                borderRadius: "var(--radius-md)",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.35rem",
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--teal)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--teal)",
                  }}
                >
                  Course already exists!
                </span>
              </div>
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "var(--text-secondary)",
                  marginBottom: "0.5rem",
                }}
              >
                {existingCourse.oneLiner ||
                  `A course for ${existingCourse.ownerName}/${existingCourse.repoName} is already available.`}
              </p>
              <div
                style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
              >
                <Link
                  href={existingCourse.exploreUrl}
                  className="btn-primary"
                  style={{
                    textDecoration: "none",
                    fontSize: "0.75rem",
                    padding: "0.4rem 0.75rem",
                  }}
                >
                  View Course
                </Link>
                <span
                  style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}
                >
                  {existingCourse.moduleCount &&
                    `${existingCourse.moduleCount} modules`}
                  {existingCourse.moduleCount &&
                    existingCourse.estimatedMinutes &&
                    " · "}
                  {existingCourse.estimatedMinutes &&
                    `~${existingCourse.estimatedMinutes} min`}
                </span>
              </div>
            </div>
          )}

          {rateLimited && (
            <div style={{ marginBottom: "1rem" }}>
              <UpgradePrompt
                resetAt={rateLimited.resetAt}
                context="rate-limit"
              />
            </div>
          )}

          {isAuthenticated && userOrgs.length > 0 && (
            <div style={{ maxWidth: 540, margin: "0 auto 1rem" }}>
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
                  color: selectedOrg
                    ? "var(--text-primary)"
                    : "var(--text-tertiary)",
                }}
              >
                <option value="">Personal (no team)</option>
                {userOrgs.map((org) => (
                  <option key={org.slug} value={org.slug}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            className="btn-primary"
            disabled={!isValidUrl}
            onClick={handleOpenWizard}
            style={{ padding: "0.875rem 2.5rem", fontSize: "1rem" }}
          >
            {isAuthenticated ? "Generate Course" : "Sign in to Generate"}
          </button>
        </section>

        <section
          style={{
            padding: "4rem 1.5rem 5rem",
            background: "var(--bg-secondary)",
          }}
        >
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "1.75rem",
                fontWeight: 700,
                textAlign: "center",
                marginBottom: "0.5rem",
              }}
            >
              {featuredCourses.length > 0 ? "Featured Courses" : "See What's Possible"}
            </h2>
            <p
              style={{
                textAlign: "center",
                color: "var(--text-secondary)",
                marginBottom: "2.5rem",
                fontSize: "1rem",
              }}
            >
              {featuredCourses.length > 0
                ? "Popular AI-generated courses from the community"
                : "Pre-built courses from popular open-source projects"}
            </p>

            {featuredCourses.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                  gap: "1.25rem",
                }}
              >
                {featuredCourses.map((fc) => {
                  const languages = fc.techStack?.languages || [];
                  return (
                    <Link
                      key={fc.id}
                      href={`/explore/${fc.ownerName}/${fc.repoName}`}
                      className="card"
                      style={{
                        background: "white",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.625rem",
                        textDecoration: "none",
                        color: "inherit",
                        transition: "transform 0.2s, box-shadow 0.2s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <img
                          src={`https://github.com/${fc.ownerName}.png?size=32`}
                          alt=""
                          width={24}
                          height={24}
                          style={{ borderRadius: "var(--radius-full)", flexShrink: 0 }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", fontWeight: 600 }}>
                          {fc.ownerName}/{fc.repoName}
                        </span>
                      </div>
                      {fc.oneLiner && (
                        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {fc.oneLiner}
                        </p>
                      )}
                      <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                        {languages.slice(0, 3).map((lang) => (
                          <span key={lang} className="badge" style={{ background: "var(--teal-light)", color: "var(--teal)" }}>{lang}</span>
                        ))}
                        {fc.difficulty && (
                          <span className="badge" style={{ background: fc.difficulty === "Advanced" ? "#FFF0EE" : "#FFF8E1", color: fc.difficulty === "Advanced" ? "var(--accent)" : "var(--warning)" }}>
                            {fc.difficulty}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "auto" }}>
                        {fc.stars != null && fc.stars > 0 && (
                          <span>&#9733; {fc.stars >= 1000 ? `${(fc.stars / 1000).toFixed(1)}k` : fc.stars}</span>
                        )}
                        {fc.moduleCount && <span>{fc.moduleCount} modules</span>}
                        {fc.estimatedMinutes && <span>~{fc.estimatedMinutes} min</span>}
                        {fc.viewCount > 0 && <span>{fc.viewCount} views</span>}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: "1.25rem",
                }}
              >
                {demoCourses.map((demo) => {
                  const isAvailable = !!demo.shareToken;
                  return (
                    <div
                      key={demo.repo}
                      className="card"
                      style={{
                        background: "white",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.75rem",
                        opacity: isAvailable ? 1 : 0.65,
                        cursor: isAvailable ? "pointer" : "default",
                        transition: "opacity 0.2s, transform 0.2s",
                      }}
                      onClick={() => {
                        if (isAvailable)
                          window.location.href = `/share/${demo.shareToken}`;
                      }}
                    >
                      <code
                        style={{
                          fontSize: "0.8rem",
                          background: "var(--bg-secondary)",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--text-primary)",
                          fontWeight: 500,
                          alignSelf: "flex-start",
                        }}
                      >
                        {demo.repo}
                      </code>
                      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                        {demo.desc}
                      </p>
                      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
                        {demo.techs.map((t) => (
                          <span key={t} className="badge" style={{ background: "var(--teal-light)", color: "var(--teal)" }}>{t}</span>
                        ))}
                        <span className="badge" style={{ background: demo.difficulty === "Advanced" ? "#FFF0EE" : "#FFF8E1", color: demo.difficulty === "Advanced" ? "var(--accent)" : "var(--warning)" }}>
                          {demo.difficulty}
                        </span>
                        <span className="badge" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
                          {demo.time}
                        </span>
                      </div>
                      {isAvailable ? (
                        <Link
                          href={`/share/${demo.shareToken}`}
                          className="btn-secondary"
                          style={{ textAlign: "center", textDecoration: "none", fontSize: "0.8rem", padding: "0.5rem" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          View Course {"\u2192"}
                        </Link>
                      ) : (
                        <div style={{ padding: "0.5rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", textAlign: "center", fontSize: "0.8rem", color: "var(--text-tertiary)", fontWeight: 500 }}>
                          Coming soon
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ textAlign: "center", marginTop: "2rem" }}>
              <Link
                href="/explore"
                className="btn-secondary"
                style={{ textDecoration: "none", fontSize: "0.9rem", padding: "0.625rem 1.5rem" }}
              >
                Browse All Courses {"\u2192"}
              </Link>
            </div>
          </div>
        </section>

        <footer
          style={{
            padding: "2rem 1.5rem",
            textAlign: "center",
            borderTop: "1px solid var(--border-color)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "1.5rem",
              marginBottom: "0.75rem",
            }}
          >
            <Link
              href="/explore"
              style={{
                color: "var(--text-secondary)",
                textDecoration: "none",
                fontSize: "0.8rem",
              }}
            >
              Explore Courses
            </Link>
            <Link
              href="/pricing"
              style={{
                color: "var(--text-secondary)",
                textDecoration: "none",
                fontSize: "0.8rem",
              }}
            >
              Pricing
            </Link>
          </div>
          <p style={{ color: "var(--text-tertiary)", fontSize: "0.8rem" }}>
            <span style={{ color: "var(--accent)", fontWeight: 600 }}>
              {"\u25C9"} CodeLens AI
            </span>{" "}
            &mdash; Powered by Gemini AI
          </p>
        </footer>
      </main>

      {showWizard && (
        <CourseWizardModal
          githubUrl={url}
          organizationSlug={selectedOrg || undefined}
          repoPreview={repoPreview}
          onClose={() => setShowWizard(false)}
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
