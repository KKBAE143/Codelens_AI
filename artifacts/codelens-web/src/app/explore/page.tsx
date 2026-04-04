"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface ExploreCourse {
  id: string;
  slug: string | null;
  githubUrl: string;
  repoName: string;
  ownerName: string;
  targetAudience: string;
  depthPreset: string | null;
  techStack: { languages: string[]; frameworks: string[] } | null;
  oneLiner: string | null;
  difficulty: string | null;
  estimatedMinutes: number | null;
  moduleCount: number | null;
  stars: number | null;
  focusAreas: string[] | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
}

interface ExploreResponse {
  courses: ExploreCourse[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
}

const SKILL_CATEGORIES = [
  "Backend", "Frontend", "DevOps", "AI/ML", "Security", "Mobile", "Data", "Infrastructure",
];

const LANGUAGES = [
  "TypeScript", "JavaScript", "Python", "Go", "Rust", "Java", "Ruby", "PHP", "C", "C++", "C#", "Kotlin", "Swift",
];

const SORT_OPTIONS = [
  { value: "recent", label: "Most Recent" },
  { value: "views", label: "Most Viewed" },
  { value: "stars", label: "Most Stars" },
  { value: "modules", label: "Most Modules" },
];

const AUDIENCES = [
  { value: "vibe_coder", label: "Vibe Coder" },
  { value: "new_engineer", label: "New Engineer" },
  { value: "product_manager", label: "Product Manager" },
  { value: "security_auditor", label: "Security Auditor" },
];

const DEPTHS = [
  { value: "quick", label: "Quick Overview" },
  { value: "full", label: "Full Course" },
  { value: "deep", label: "Deep Dive" },
];

const FOCUS_AREAS = [
  "Architecture", "API", "Authentication", "Database", "Testing", "CI/CD", "Security", "Performance",
];

const AUDIENCE_SHORT: Record<string, string> = {
  vibe_coder: "Vibe Coder",
  new_engineer: "New Engineer",
  product_manager: "PM",
  security_auditor: "Security",
};

function CourseCard({ course }: { course: ExploreCourse }) {
  const languages = course.techStack?.languages || [];
  const daysSinceUpdate = Math.floor(
    (Date.now() - new Date(course.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <Link
      href={`/explore/${course.ownerName}/${course.repoName}`}
      className="explore-card"
    >
      <div className="explore-card-header">
        <div className="explore-card-repo">
          <img
            src={`https://github.com/${course.ownerName}.png?size=32`}
            alt={course.ownerName}
            width={24}
            height={24}
            style={{ borderRadius: "var(--radius-full)", flexShrink: 0 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div>
            <span className="explore-card-owner">{course.ownerName}</span>
            <span className="explore-card-name">/{course.repoName}</span>
          </div>
        </div>
      </div>

      {course.oneLiner && (
        <p className="explore-card-description">{course.oneLiner}</p>
      )}

      <div className="explore-card-badges">
        {languages.slice(0, 3).map((lang) => (
          <span key={lang} className="explore-lang-badge">{lang}</span>
        ))}
        {course.difficulty && (
          <span className="badge" style={{ background: course.difficulty === "Advanced" ? "var(--error-bg)" : "var(--warning-bg)", color: course.difficulty === "Advanced" ? "var(--accent)" : "var(--warning)", fontSize: "0.7rem" }}>
            {course.difficulty}
          </span>
        )}
        {AUDIENCE_SHORT[course.targetAudience] && (
          <span className="badge" style={{ background: "var(--accent-light)", color: "var(--accent)", fontSize: "0.7rem" }}>
            {AUDIENCE_SHORT[course.targetAudience]}
          </span>
        )}
      </div>

      <div className="explore-card-meta">
        {course.stars != null && course.stars > 0 && (
          <span title="GitHub stars">&#9733; {course.stars >= 1000 ? `${(course.stars / 1000).toFixed(1)}k` : course.stars}</span>
        )}
        {course.moduleCount && (
          <span>{course.moduleCount} modules</span>
        )}
        {course.estimatedMinutes && (
          <span>{course.estimatedMinutes} min</span>
        )}
        {course.viewCount > 0 && (
          <span>{course.viewCount} views</span>
        )}
      </div>

      <div className="explore-card-footer">
        <span className="explore-card-date">
          {daysSinceUpdate === 0 ? "Today" : daysSinceUpdate === 1 ? "Yesterday" : `${daysSinceUpdate}d ago`}
        </span>
        <span className="explore-card-cta">View Course &rarr;</span>
      </div>
    </Link>
  );
}

export default function ExplorePage() {
  const [courses, setCourses] = useState<ExploreCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState("");
  const [category, setCategory] = useState("");
  const [focusArea, setFocusArea] = useState("");
  const [audience, setAudience] = useState("");
  const [depth, setDepth] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchCourses = useCallback(async (p: number, s: string, l: string, st: string, fa?: string, aud?: string, dep?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "20", sort: st });
      if (s) params.set("search", s);
      if (l) params.set("language", l);
      if (fa) params.set("focusArea", fa);
      if (aud) params.set("audience", aud);
      if (dep) params.set("depth", dep);
      const res = await fetch(`/api/courses/explore?${params}`);
      if (res.ok) {
        const data: ExploreResponse = await res.json();
        setCourses(data.courses);
        setTotalPages(data.pagination.totalPages);
        setTotalCount(data.pagination.totalCount);
      }
    } catch (err) {
      console.error("Failed to fetch courses:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses(page, search, language, sort, focusArea, audience, depth);
  }, [page, language, sort, focusArea, audience, depth, fetchCourses]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      fetchCourses(1, value, language, sort, focusArea, audience, depth);
    }, 400);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <header style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem", letterSpacing: "-0.02em" }}>
            Explore Courses
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "1.05rem" }}>
            Browse {totalCount > 0 ? `${totalCount} ` : ""}AI-generated courses for open source projects
          </p>
        </header>

        <div className="explore-filters" style={{ marginBottom: "1rem" }}>
          <div className="explore-search-wrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Search repos, orgs, keywords..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="explore-search-input"
            />
          </div>

          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="explore-select">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="lms-category-chips">
          {SKILL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`lms-category-chip ${category === cat ? "lms-category-chip-active" : ""}`}
              onClick={() => { setCategory(category === cat ? "" : cat); setFocusArea(category === cat ? "" : cat); setPage(1); }}
            >
              {cat}
            </button>
          ))}
          <select
            value={language}
            onChange={(e) => { setLanguage(e.target.value); setPage(1); }}
            className="explore-select"
            style={{ marginLeft: "auto", minWidth: 120 }}
          >
            <option value="">All Languages</option>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        <div className="explore-mobile-filters" style={{ display: "none", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <select value={audience} onChange={(e) => { setAudience(e.target.value); setPage(1); }} className="explore-select">
            <option value="">All Audiences</option>
            {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <select value={depth} onChange={(e) => { setDepth(e.target.value); setPage(1); }} className="explore-select">
            <option value="">All Depths</option>
            {DEPTHS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <select value={focusArea} onChange={(e) => { setFocusArea(e.target.value); setPage(1); }} className="explore-select">
            <option value="">All Focus Areas</option>
            {FOCUS_AREAS.map((fa) => <option key={fa} value={fa}>{fa}</option>)}
          </select>
        </div>

        <div className="lms-explore-layout">
          <aside className="lms-explore-sidebar">
            <div className="lms-explore-sidebar-section">
              <h3>Audience</h3>
              <div className="lms-filter-list">
                <button
                  className={`lms-filter-item ${audience === "" ? "lms-filter-item-active" : ""}`}
                  onClick={() => { setAudience(""); setPage(1); }}
                >
                  All Audiences
                </button>
                {AUDIENCES.map((a) => (
                  <button
                    key={a.value}
                    className={`lms-filter-item ${audience === a.value ? "lms-filter-item-active" : ""}`}
                    onClick={() => { setAudience(audience === a.value ? "" : a.value); setPage(1); }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="lms-explore-sidebar-section">
              <h3>Depth</h3>
              <div className="lms-filter-list">
                <button
                  className={`lms-filter-item ${depth === "" ? "lms-filter-item-active" : ""}`}
                  onClick={() => { setDepth(""); setPage(1); }}
                >
                  All Depths
                </button>
                {DEPTHS.map((d) => (
                  <button
                    key={d.value}
                    className={`lms-filter-item ${depth === d.value ? "lms-filter-item-active" : ""}`}
                    onClick={() => { setDepth(depth === d.value ? "" : d.value); setPage(1); }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="lms-explore-sidebar-section">
              <h3>Focus Area</h3>
              <div className="lms-filter-list">
                <button
                  className={`lms-filter-item ${focusArea === "" ? "lms-filter-item-active" : ""}`}
                  onClick={() => { setFocusArea(""); setPage(1); }}
                >
                  All Areas
                </button>
                {FOCUS_AREAS.map((fa) => (
                  <button
                    key={fa}
                    className={`lms-filter-item ${focusArea === fa ? "lms-filter-item-active" : ""}`}
                    onClick={() => { setFocusArea(focusArea === fa ? "" : fa); setPage(1); }}
                  >
                    {fa}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <div className="lms-explore-main">
            {loading ? (
              <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--text-secondary)" }}>
                Loading courses...
              </div>
            ) : courses.length === 0 ? (
              <div style={{ textAlign: "center", padding: "4rem 0" }}>
                <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", marginBottom: "1rem" }}>
                  No courses found{search ? ` for "${search}"` : ""}.
                </p>
                <Link href="/" className="btn-primary" style={{ textDecoration: "none" }}>
                  Generate Your First Course
                </Link>
              </div>
            ) : (
              <>
                <div className="explore-grid">
                  {courses.map((course) => (
                    <CourseCard key={course.id} course={course} />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="explore-pagination">
                    <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </button>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                      Page {page} of {totalPages}
                    </span>
                    <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="explore-cta-section">
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.4rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            Don&#39;t see your repo?
          </h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
            Generate a course for any GitHub repository in minutes.
          </p>
          <Link href="/" className="btn-primary" style={{ textDecoration: "none" }}>
            Generate a Course
          </Link>
        </div>
      </main>
    </div>
  );
}
