"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/Toast";
import { GenerationModal } from "@/components/GenerationModal";
import { BillingSection } from "@/components/BillingSection";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function DashboardXpWidget() {
  const [stats, setStats] = useState<{ totalXp: number; currentStreak: number; longestStreak: number; lastActiveDate: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/users/me/stats", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setStats(data); })
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const today = new Date().toISOString().split("T")[0];
  const isActiveToday = stats.lastActiveDate === today;

  return (
    <div className="lms-xp-widget" style={{ display: "flex", gap: "1.5rem", padding: "1rem 1.25rem", background: "var(--bg-secondary, #f7f7f5)", borderRadius: "var(--radius-lg)", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--accent)" style={{ flexShrink: 0 }}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, lineHeight: 1 }}>{stats.totalXp.toLocaleString()}</div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total XP</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "1.25rem" }}>{isActiveToday ? "🔥" : "💤"}</span>
        <div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, lineHeight: 1 }}>{stats.currentStreak}</div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Day Streak</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "1.25rem" }}>🏆</span>
        <div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, lineHeight: 1 }}>{stats.longestStreak}</div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Best Streak</div>
        </div>
      </div>
    </div>
  );
}

function DashboardTeamPanel() {
  const [orgs, setOrgs] = useState<{ slug: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/org/my", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { organizations: [] }))
      .then((data) => setOrgs(data.organizations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "2rem 0" }}>
        <div className="skeleton" style={{ height: 80, borderRadius: "var(--radius-md)" }} />
      </div>
    );
  }

  if (orgs.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-secondary)" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.5rem" }}>No teams yet</p>
        <p style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>Create or join a team to manage courses together, assign learning paths, and track progress.</p>
        <Link href="/org/new" className="btn-primary" style={{ textDecoration: "none" }}>Create a Team</Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "1rem 0" }}>
      {orgs.map((org) => (
        <Link key={org.slug} href={`/org/${org.slug}`} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", textDecoration: "none", color: "inherit" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ width: 36, height: 36, borderRadius: "var(--radius-md)", background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "var(--accent)", fontSize: "0.9rem" }}>
              {org.name.charAt(0).toUpperCase()}
            </div>
            <span style={{ fontWeight: 600 }}>{org.name}</span>
          </div>
          <span style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>Manage →</span>
        </Link>
      ))}
    </div>
  );
}

interface ChangesSince {
  summary: string;
  changedFiles: string[];
  addedFiles: string[];
  modifiedFiles: string[];
  removedFiles: string[];
  previousVersionId: string;
  detectedAt: string;
}

interface CourseItem {
  id: string;
  repoName: string;
  ownerName: string;
  targetAudience: string;
  status: string;
  oneLiner: string | null;
  techStack: { languages: string[]; frameworks: string[] } | null;
  difficulty: string | null;
  estimatedMinutes: number | null;
  moduleCount: number | null;
  shareToken: string | null;
  isPublic: boolean;
  version: number;
  createdBy: string | null;
  changesSince: ChangesSince | null;
  errorMessage: string | null;
  hasWebhook: boolean;
  webhookAutoRegenerate: boolean | null;
  lastSeenVersion: number;
  percentComplete: number;
  lastViewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const AUDIENCE_LABELS: Record<string, string> = {
  vibe_coder: "Vibe Coder",
  new_engineer: "New Engineer",
  product_manager: "PM",
  security_auditor: "Security",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  completed: { bg: "var(--teal-light)", color: "var(--teal)" },
  generating: { bg: "#FFF8E1", color: "var(--warning)" },
  pending: { bg: "var(--bg-secondary)", color: "var(--text-secondary)" },
  failed: { bg: "#FFF0EE", color: "var(--error)" },
};

async function fetchCourses(): Promise<{ courses: CourseItem[] }> {
  const res = await fetch("/api/courses", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch courses");
  return res.json();
}

function EmailPreferenceToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    fetch("/api/user/email-preferences", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setEnabled(data.emailNotifications);
      })
      .catch(() => {});
  }, []);

  const handleToggle = async () => {
    if (toggling || enabled === null) return;
    setToggling(true);
    const newVal = !enabled;
    try {
      const res = await fetch("/api/user/email-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emailNotifications: newVal }),
      });
      if (res.ok) setEnabled(newVal);
    } catch {}
    setToggling(false);
  };

  if (enabled === null) return null;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0.75rem 1rem",
      background: "var(--bg-secondary)",
      borderRadius: "var(--radius-md)",
      marginBottom: "1.5rem",
      border: "1px solid var(--border-color)",
    }}>
      <div>
        <div style={{ fontSize: "0.85rem", fontWeight: 500 }}>Email Notifications</div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
          Get notified when courses are generated or completed
        </div>
      </div>
      <button
        onClick={handleToggle}
        disabled={toggling}
        style={{
          width: 44, height: 24, borderRadius: 12, border: "none",
          cursor: toggling ? "wait" : "pointer",
          background: enabled ? "var(--teal)" : "var(--border-color)",
          position: "relative", transition: "background 0.2s ease",
          flexShrink: 0,
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: "50%", background: "white",
          position: "absolute", top: 3,
          left: enabled ? 23 : 3,
          transition: "left 0.2s ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </button>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="loading-container">
          <p>Loading dashboard...</p>
        </div>
      }
    >
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const {
    user,
    isAuthenticated,
    isLoading: authLoading,
    login,
    refetch: refetchUser,
  } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [generatingCourseId, setGeneratingCourseId] = useState<string | null>(
    null,
  );
  const checkoutSuccess = searchParams.get("checkout") === "success";

  useEffect(() => {
    if (checkoutSuccess) {
      showToast("Subscription activated! Welcome to your new plan.", "success");
      window.history.replaceState({}, "", "/dashboard");
      refetchUser();
      const timer = setTimeout(() => {
        refetchUser();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [checkoutSuccess, showToast, refetchUser]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) login();
  }, [authLoading, isAuthenticated, login]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["courses"],
    queryFn: fetchCourses,
    enabled: isAuthenticated,
  });

  const courses = data?.courses ?? [];

  const { data: invitationsData } = useQuery({
    queryKey: ["invitations"],
    queryFn: async () => {
      const res = await fetch("/api/org/invitations", {
        credentials: "include",
      });
      if (!res.ok) return { invitations: [] };
      return res.json();
    },
    enabled: isAuthenticated,
  });
  const invitations = invitationsData?.invitations ?? [];

  const { data: assignmentsData } = useQuery({
    queryKey: ["my-assignments"],
    queryFn: async () => {
      const res = await fetch("/api/courses/assigned", {
        credentials: "include",
      });
      if (!res.ok) return { assignments: [] };
      return res.json();
    },
    enabled: isAuthenticated,
  });
  const myAssignments = assignmentsData?.assignments ?? [];

  const invitationMutation = useMutation({
    mutationFn: async ({
      invitationId,
      action,
    }: {
      invitationId: string;
      action: string;
    }) => {
      const res = await fetch("/api/org/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ invitationId, action }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      showToast("Done!", "success");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/courses/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      showToast("Course deleted", "success");
    },
    onError: () => showToast("Failed to delete course", "error"),
  });

  const handleDelete = (id: string) => {
    if (!confirm("Delete this course? This cannot be undone.")) return;
    deleteMutation.mutate(id);
  };

  const handleCopyShare = (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(url);
    showToast("Share link copied!", "success");
  };

  const handleWebhookToggle = async (
    courseId: string,
    currentlyEnabled: boolean,
  ) => {
    const action = currentlyEnabled ? "disable" : "enable";
    if (
      currentlyEnabled &&
      !confirm(
        "Disable auto-updates for this course? The webhook will be removed from GitHub.",
      )
    )
      return;
    try {
      const res = await fetch(`/api/courses/${courseId}/webhook`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: !currentlyEnabled }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${action} webhook`);
      }
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      showToast(
        currentlyEnabled ? "Auto-updates disabled" : "Auto-updates enabled",
        "success",
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : `Failed to ${action} webhook`,
        "error",
      );
    }
  };

  const handleRegenerate = async (id: string) => {
    if (!confirm("Regenerate this course? This will use 1 generation credit."))
      return;
    try {
      const res = await fetch(`/api/courses/${id}/regenerate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to regenerate");
      }
      const data = await res.json();
      setGeneratingCourseId(data.courseId);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to regenerate",
        "error",
      );
    }
  };

  const [activeTab, setActiveTab] = useState<"courses" | "assigned" | "team">("courses");

  useEffect(() => {
    if (myAssignments.length > 0 && courses.length === 0) setActiveTab("assigned");
  }, [myAssignments.length, courses.length]);

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days} days ago`;
    return `${Math.floor(days / 30)} months ago`;
  };

  if (authLoading || (!isAuthenticated && !authLoading)) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="skeleton" style={{ width: 200, height: 40 }} />
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
      {user && <BillingSection user={user} />}

      <EmailPreferenceToggle />

      <DashboardXpWidget />

      <div className="lms-dash-header">
        <div>
          <h1>My Learning</h1>
          <p>
            {courses.length} course{courses.length !== 1 ? "s" : ""} generated
            {myAssignments.length > 0 && ` · ${myAssignments.length} assigned`}
          </p>
        </div>
        <div className="lms-dash-actions">
          <Link href="/org/new" className="btn-secondary" style={{ textDecoration: "none" }}>
            Create Team
          </Link>
          <Link href="/" className="btn-primary" style={{ textDecoration: "none" }}>
            + New Course
          </Link>
        </div>
      </div>

      {invitations.length > 0 && (
        <div style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {invitations.map(
            (inv: { id: string; orgName: string; invitedByName: string; orgSlug: string }) => (
              <div
                key={inv.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "0.75rem 1rem", background: "#F0F4FF", border: "1px solid #D6DEFF",
                  borderRadius: "var(--radius-md)", flexWrap: "wrap", gap: "0.5rem",
                }}
              >
                <span style={{ fontSize: "0.85rem" }}>
                  <strong>{inv.orgName}</strong> has invited you to join their team
                  {inv.invitedByName && (
                    <span style={{ color: "var(--text-tertiary)" }}> (by {inv.invitedByName})</span>
                  )}
                </span>
                <div style={{ display: "flex", gap: "0.375rem" }}>
                  <button
                    className="btn-primary"
                    style={{ padding: "0.375rem 0.75rem", fontSize: "0.8rem" }}
                    onClick={() => invitationMutation.mutate({ invitationId: inv.id, action: "accept" })}
                    disabled={invitationMutation.isPending}
                  >
                    Accept
                  </button>
                  <button
                    className="btn-ghost"
                    style={{ padding: "0.375rem 0.75rem", fontSize: "0.8rem" }}
                    onClick={() => invitationMutation.mutate({ invitationId: inv.id, action: "decline" })}
                    disabled={invitationMutation.isPending}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      <div className="lms-tabs" role="tablist" aria-label="Dashboard sections">
        <button
          role="tab"
          aria-selected={activeTab === "courses"}
          aria-controls="panel-courses"
          className={`lms-tab ${activeTab === "courses" ? "lms-tab-active" : ""}`}
          onClick={() => setActiveTab("courses")}
        >
          My Courses
          <span className="lms-tab-badge">{courses.length}</span>
        </button>
        {myAssignments.length > 0 && (
          <button
            role="tab"
            aria-selected={activeTab === "assigned"}
            aria-controls="panel-assigned"
            className={`lms-tab ${activeTab === "assigned" ? "lms-tab-active" : ""}`}
            onClick={() => setActiveTab("assigned")}
          >
            Assigned
            <span className="lms-tab-badge">{myAssignments.length}</span>
          </button>
        )}
        <button
          role="tab"
          aria-selected={activeTab === "team"}
          aria-controls="panel-team"
          className={`lms-tab ${activeTab === "team" ? "lms-tab-active" : ""}`}
          onClick={() => setActiveTab("team")}
        >
          My Team
        </button>
      </div>

      {activeTab === "assigned" && myAssignments.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            {myAssignments.map(
              (a: {
                id: string;
                courseId: string;
                repoName: string;
                ownerName: string;
                dueDate: string | null;
                note: string | null;
                orgName: string;
              }) => {
                const isOverdue = a.dueDate && new Date(a.dueDate) < new Date();
                return (
                  <Link
                    key={a.id}
                    href={`/course/${a.courseId}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div
                      className="card"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.75rem 1rem",
                        border: isOverdue
                          ? "1px solid var(--error)"
                          : undefined,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                        }}
                      >
                        <span
                          className="badge"
                          style={{
                            background: "var(--accent-light)",
                            color: "var(--accent)",
                            flexShrink: 0,
                          }}
                        >
                          Assigned
                        </span>
                        <code style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                          {a.ownerName}/{a.repoName}
                        </code>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-tertiary)",
                          }}
                        >
                          from {a.orgName}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        {a.dueDate && (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              color: isOverdue
                                ? "var(--error)"
                                : "var(--text-secondary)",
                              fontWeight: isOverdue ? 600 : 400,
                            }}
                          >
                            Due {new Date(a.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              },
            )}
          </div>
        </div>
      )}

      {activeTab === "team" && (
        <DashboardTeamPanel />
      )}

      {activeTab === "courses" && (isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 160, borderRadius: "var(--radius-md)" }} />
          ))}
        </div>
      ) : isError ? (
        <div
          style={{
            textAlign: "center",
            padding: "3rem 2rem",
            background: "white",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <p style={{ color: "var(--error)", marginBottom: "1rem" }}>
            Failed to load courses
          </p>
          <button className="btn-primary" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : courses.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "4rem 2rem",
            background: "white",
            border: "2px dashed var(--border-color)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📚</div>
          <h3
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1.25rem",
              fontWeight: 600,
              marginBottom: "0.5rem",
            }}
          >
            Your first course is one URL away
          </h3>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
            Paste a GitHub URL to generate your first interactive course
          </p>
          <Link
            href="/"
            className="btn-primary"
            style={{ textDecoration: "none" }}
          >
            Generate a Course
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(min(100%, 380px), 1fr))",
            gap: "1rem",
          }}
        >
          {courses.map((course) => {
            const statusStyle =
              STATUS_COLORS[course.status] || STATUS_COLORS.pending;
            return (
              <div
                key={course.id}
                className="card"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  cursor: course.status === "completed" ? "pointer" : undefined,
                }}
                onClick={() => {
                  if (course.status === "completed")
                    router.push(`/course/${course.id}`);
                  else if (
                    course.status === "generating" ||
                    course.status === "pending"
                  )
                    setGeneratingCourseId(course.id);
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                      flex: 1,
                    }}
                  >
                    <code
                      style={{
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        background: "var(--bg-secondary)",
                        padding: "0.15rem 0.5rem",
                        borderRadius: "var(--radius-sm)",
                      }}
                    >
                      {course.ownerName}/{course.repoName}
                    </code>
                    <a
                      href={`https://github.com/${course.ownerName}/${course.repoName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      ↗
                    </a>
                  </div>
                  <span
                    className="badge"
                    style={{
                      background: statusStyle.bg,
                      color: statusStyle.color,
                      flexShrink: 0,
                    }}
                  >
                    {course.status}
                  </span>
                  {course.version > 1 &&
                    course.status === "completed" &&
                    course.version > course.lastSeenVersion && (
                      <span
                        className="badge"
                        style={{
                          background: "#E8F5E9",
                          color: "#2E7D32",
                          flexShrink: 0,
                        }}
                      >
                        Updated {timeAgo(course.updatedAt)}
                      </span>
                    )}
                  {course.hasWebhook && course.webhookAutoRegenerate && (
                    <span
                      className="badge"
                      style={{
                        background: "#E3F2FD",
                        color: "#1565C0",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                    >
                      <span style={{ fontSize: "0.6rem" }}>🔄</span>
                      Auto-update
                    </span>
                  )}
                </div>

                {course.oneLiner && (
                  <p
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--text-secondary)",
                      lineHeight: 1.5,
                    }}
                  >
                    {course.oneLiner}
                  </p>
                )}

                {course.changesSince &&
                  course.version > 1 &&
                  course.version > course.lastSeenVersion && (
                    <div
                      style={{
                        background: "#E8F5E9",
                        border: "1px solid #C8E6C9",
                        borderRadius: "var(--radius-sm)",
                        padding: "0.5rem 0.625rem",
                        fontSize: "0.8rem",
                        color: "#2E7D32",
                        lineHeight: 1.4,
                      }}
                    >
                      <strong
                        style={{
                          fontSize: "0.7rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.03em",
                        }}
                      >
                        What changed:
                      </strong>{" "}
                      {course.changesSince.summary}
                      {course.changesSince.changedFiles.length > 0 && (
                        <details
                          style={{ marginTop: "0.375rem", fontSize: "0.75rem" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <summary
                            style={{ cursor: "pointer", fontWeight: 600 }}
                          >
                            ℹ️ {course.changesSince.changedFiles.length} files
                            changed since your last view
                          </summary>
                          <div
                            style={{
                              marginTop: "0.25rem",
                              fontFamily: "var(--font-mono)",
                              fontSize: "0.7rem",
                              maxHeight: 120,
                              overflowY: "auto",
                            }}
                          >
                            {(course.changesSince.addedFiles?.length ?? 0) >
                              0 && (
                              <div style={{ marginBottom: "0.125rem" }}>
                                {course.changesSince.addedFiles.map((f) => (
                                  <div key={f} style={{ color: "#2E7D32" }}>
                                    + {f}
                                  </div>
                                ))}
                              </div>
                            )}
                            {(course.changesSince.modifiedFiles?.length ?? 0) >
                              0 && (
                              <div style={{ marginBottom: "0.125rem" }}>
                                {course.changesSince.modifiedFiles.map((f) => (
                                  <div key={f} style={{ color: "#E65100" }}>
                                    ~ {f}
                                  </div>
                                ))}
                              </div>
                            )}
                            {(course.changesSince.removedFiles?.length ?? 0) >
                              0 && (
                              <div>
                                {course.changesSince.removedFiles.map((f) => (
                                  <div key={f} style={{ color: "#C62828" }}>
                                    - {f}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                  )}

                <div
                  style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}
                >
                  <span
                    className="badge"
                    style={{
                      background: "var(--accent-light)",
                      color: "var(--accent)",
                    }}
                  >
                    {AUDIENCE_LABELS[course.targetAudience] ||
                      course.targetAudience}
                  </span>
                  {course.techStack?.languages?.slice(0, 3).map((l) => (
                    <span
                      key={l}
                      className="badge"
                      style={{
                        background: "var(--teal-light)",
                        color: "var(--teal)",
                      }}
                    >
                      {l}
                    </span>
                  ))}
                  {course.techStack?.frameworks?.slice(0, 2).map((f) => (
                    <span
                      key={f}
                      className="badge"
                      style={{ background: "#F0F4FF", color: "#4A5BC7" }}
                    >
                      {f}
                    </span>
                  ))}
                  {course.difficulty && (
                    <span
                      className="badge"
                      style={{
                        background:
                          course.difficulty.toLowerCase() === "beginner"
                            ? "var(--teal-light)"
                            : course.difficulty.toLowerCase() === "advanced"
                              ? "#FFF0EE"
                              : "#FFF8E1",
                        color:
                          course.difficulty.toLowerCase() === "beginner"
                            ? "var(--teal)"
                            : course.difficulty.toLowerCase() === "advanced"
                              ? "var(--accent)"
                              : "var(--warning)",
                      }}
                    >
                      {course.difficulty}
                    </span>
                  )}
                  {course.estimatedMinutes && (
                    <span
                      className="badge"
                      style={{
                        background: "var(--bg-secondary)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      ~{course.estimatedMinutes} min
                    </span>
                  )}
                </div>

                {course.status === "completed" && (
                  <div style={{ marginTop: "0.25rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                      <span style={{ fontSize: "0.7rem", fontWeight: 600, color: course.percentComplete === 100 ? "var(--success)" : "var(--text-secondary)" }}>
                        {course.percentComplete}% complete
                      </span>
                      {course.lastViewedAt && (
                        <span style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>
                          Last accessed {timeAgo(course.lastViewedAt)}
                        </span>
                      )}
                    </div>
                    <div style={{ height: 4, background: "var(--bg-secondary)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${course.percentComplete}%`, background: course.percentComplete === 100 ? "var(--success)" : "var(--accent)", borderRadius: 2, transition: "width 0.3s" }} />
                    </div>
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: "0.5rem",
                    borderTop: "1px solid var(--border-color)",
                    marginTop: "auto",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      fontSize: "0.75rem",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    {course.moduleCount && (
                      <span>{course.moduleCount} modules</span>
                    )}
                    <span>{timeAgo(course.createdAt)}</span>
                    {course.version > 1 && <span>v{course.version}</span>}
                  </div>
                  <div
                    style={{ display: "flex", gap: "0.25rem" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {course.status === "completed" && course.shareToken && (
                      <button
                        className="btn-ghost"
                        onClick={() => handleCopyShare(course.shareToken!)}
                        title="Copy share link"
                      >
                        🔗
                      </button>
                    )}
                    {course.status === "completed" &&
                      course.createdBy === user?.id && (
                        <button
                          className="btn-ghost"
                          onClick={() =>
                            handleWebhookToggle(
                              course.id,
                              !!(
                                course.hasWebhook &&
                                course.webhookAutoRegenerate
                              ),
                            )
                          }
                          title={
                            course.hasWebhook && course.webhookAutoRegenerate
                              ? "Disable auto-updates"
                              : "Enable auto-updates"
                          }
                          style={{
                            color:
                              course.hasWebhook && course.webhookAutoRegenerate
                                ? "#1565C0"
                                : undefined,
                          }}
                        >
                          {course.hasWebhook && course.webhookAutoRegenerate
                            ? "📡"
                            : "📡"}
                        </button>
                      )}
                    {course.status === "completed" && (
                      <button
                        className="btn-ghost"
                        onClick={() => handleRegenerate(course.id)}
                        title="Regenerate course"
                      >
                        🔄
                      </button>
                    )}
                    <button
                      className="btn-ghost"
                      onClick={() => handleDelete(course.id)}
                      disabled={deleteMutation.isPending}
                      style={{ color: "var(--error)" }}
                      title="Delete"
                    >
                      {deleteMutation.isPending ? "..." : "🗑"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {generatingCourseId && (
        <GenerationModal
          courseId={generatingCourseId}
          onClose={() => {
            setGeneratingCourseId(null);
            queryClient.invalidateQueries({ queryKey: ["courses"] });
          }}
        />
      )}
    </main>
  );
}
