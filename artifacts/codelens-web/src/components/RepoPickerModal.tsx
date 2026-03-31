"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Repo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  owner: { login: string; avatar_url: string };
}

interface GHOrg {
  login: string;
  avatar_url: string;
  description: string | null;
}

interface RepoPickerModalProps {
  onSelect: (url: string) => void;
  onClose: () => void;
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  Ruby: "#701516",
  PHP: "#4F5D95",
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Elixir: "#6e4a7e",
  Scala: "#c22d40",
  Lua: "#000080",
  R: "#198CE7",
  Haskell: "#5e5086",
  Zig: "#ec915c",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function RepoPickerModal({ onSelect, onClose }: RepoPickerModalProps) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [orgs, setOrgs] = useState<GHOrg[]>([]);
  const [currentUser, setCurrentUser] = useState<{
    login: string;
    avatar_url: string | null;
  } | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const modalRef = useRef<HTMLDivElement>(null);
  const fetchSeq = useRef(0);

  const [orgsError, setOrgsError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/github/orgs", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load GitHub accounts");
        return r.json();
      })
      .then((data) => {
        if (data.user) setCurrentUser(data.user);
        if (data.orgs) setOrgs(data.orgs);
      })
      .catch((err) => {
        setOrgsError(
          err instanceof Error ? err.message : "Failed to load accounts",
        );
      });
  }, []);

  const fetchRepos = useCallback(
    async (org: string, searchQ: string, pg: number) => {
      const seq = ++fetchSeq.current;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(pg) });
        if (org) params.set("org", org);
        if (searchQ.trim()) params.set("search", searchQ.trim());
        const res = await fetch(`/api/github/repos?${params}`, {
          credentials: "include",
        });
        if (seq !== fetchSeq.current) return;
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to fetch repos");
        setRepos(data.repos || []);
        setHasNext(data.hasNext || false);
      } catch (err) {
        if (seq !== fetchSeq.current) return;
        setError(err instanceof Error ? err.message : "Failed to fetch repos");
        setRepos([]);
      } finally {
        if (seq === fetchSeq.current) setLoading(false);
      }
    },
    [],
  );

  const triggerFetch = useCallback(
    (org: string, searchQ: string, pg: number) => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      if (searchQ.trim()) {
        searchTimeout.current = setTimeout(
          () => fetchRepos(org, searchQ, pg),
          350,
        );
      } else {
        fetchRepos(org, searchQ, pg);
      }
    },
    [fetchRepos],
  );

  useEffect(() => {
    triggerFetch(selectedOrg, search, page);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [selectedOrg, page, triggerFetch, search]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  const handleOrgChange = (org: string) => {
    setSelectedOrg(org);
    setPage(1);
    setSearch("");
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === modalRef.current) onClose();
  };

  const accountLabel = selectedOrg || currentUser?.login || "Personal";

  return (
    <div
      ref={modalRef}
      onClick={handleBackdrop}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import Git Repository"
        style={{
          background: "white",
          borderRadius: "12px",
          width: "100%",
          maxWidth: 680,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        }}
      >
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1.125rem",
              fontWeight: 700,
              margin: 0,
            }}
          >
            Import Git Repository
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.25rem",
              cursor: "pointer",
              color: "var(--text-tertiary)",
              padding: "0.25rem",
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        <div
          style={{
            padding: "1rem 1.5rem",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            gap: "0.75rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ position: "relative", minWidth: 160 }}>
            <select
              value={selectedOrg}
              onChange={(e) => handleOrgChange(e.target.value)}
              style={{
                width: "100%",
                padding: "0.5rem 2rem 0.5rem 0.75rem",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.85rem",
                fontFamily: "var(--font-body)",
                background: "white",
                cursor: "pointer",
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 0.5rem center",
              }}
            >
              <option value="">{currentUser?.login || "Personal"}</option>
              {orgs.map((o) => (
                <option key={o.login} value={o.login}>
                  {o.login}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, position: "relative", minWidth: 200 }}>
            <span
              style={{
                position: "absolute",
                left: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-tertiary)",
                fontSize: "0.85rem",
                pointerEvents: "none",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search repositories..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem 0.5rem 2.25rem",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.85rem",
                fontFamily: "var(--font-body)",
                outline: "none",
              }}
            />
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            minHeight: 0,
          }}
        >
          {orgsError && (
            <div
              style={{
                padding: "0.75rem 1.5rem",
                background: "#FFF0EE",
                color: "var(--error, #dc2626)",
                fontSize: "0.8rem",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              {orgsError}. Please try signing in again.
            </div>
          )}
          {loading && repos.length === 0 ? (
            <div
              style={{
                padding: "3rem",
                textAlign: "center",
                color: "var(--text-tertiary)",
              }}
            >
              <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
                <span
                  className="spin-icon"
                  style={{
                    display: "inline-block",
                    animation: "spin 1s linear infinite",
                  }}
                >
                  &#9696;
                </span>
              </div>
              Loading repositories...
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          ) : error ? (
            <div
              style={{
                padding: "2rem 1.5rem",
                textAlign: "center",
                color: "var(--error)",
              }}
            >
              {error}
            </div>
          ) : repos.length === 0 ? (
            <div
              style={{
                padding: "3rem",
                textAlign: "center",
                color: "var(--text-tertiary)",
              }}
            >
              No repositories found{search ? ` matching "${search}"` : ""} for{" "}
              {accountLabel}.
            </div>
          ) : (
            <div>
              {repos.map((repo) => (
                <div
                  key={repo.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.875rem 1.5rem",
                    borderBottom: "1px solid var(--border-color)",
                    gap: "1rem",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--bg-secondary)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontWeight: 600,
                          fontSize: "0.9rem",
                          color: "var(--text-primary)",
                        }}
                      >
                        {repo.name}
                      </span>
                      <span
                        style={{
                          fontSize: "0.65rem",
                          padding: "0.1rem 0.4rem",
                          borderRadius: "var(--radius-full)",
                          border: "1px solid var(--border-color)",
                          color: "var(--text-tertiary)",
                          fontWeight: 500,
                          textTransform: "uppercase",
                          letterSpacing: "0.03em",
                        }}
                      >
                        {repo.private ? "Private" : "Public"}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        marginTop: "0.25rem",
                        fontSize: "0.75rem",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {repo.language && (
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.25rem",
                          }}
                        >
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: LANG_COLORS[repo.language] || "#ccc",
                              display: "inline-block",
                              flexShrink: 0,
                            }}
                          />
                          {repo.language}
                        </span>
                      )}
                      {repo.stargazers_count > 0 && (
                        <span>
                          &#9733; {repo.stargazers_count.toLocaleString()}
                        </span>
                      )}
                      <span>{timeAgo(repo.updated_at)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onSelect(repo.html_url)}
                    style={{
                      background: "var(--text-primary)",
                      color: "white",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.4rem 1rem",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      transition: "opacity 0.15s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.opacity = "0.85")
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                  >
                    Import
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {!loading && repos.length > 0 && (
          <div
            style={{
              padding: "0.75rem 1.5rem",
              borderTop: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "0.8rem",
              color: "var(--text-tertiary)",
            }}
          >
            <span>Page {page}</span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: "0.3rem 0.75rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-sm)",
                  background: "white",
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                  opacity: page <= 1 ? 0.5 : 1,
                  fontSize: "0.8rem",
                }}
              >
                Previous
              </button>
              <button
                disabled={!hasNext}
                onClick={() => setPage((p) => p + 1)}
                style={{
                  padding: "0.3rem 0.75rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-sm)",
                  background: "white",
                  cursor: !hasNext ? "not-allowed" : "pointer",
                  opacity: !hasNext ? 0.5 : 1,
                  fontSize: "0.8rem",
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
