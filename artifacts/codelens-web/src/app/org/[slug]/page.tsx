"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/Toast";
import Link from "next/link";

interface OrgMember {
  id: string;
  userId: string;
  role: string;
  status: string;
  joinedAt: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
}

interface OrgCourse {
  id: string;
  repoName: string;
  ownerName: string;
  targetAudience: string;
  status: string;
  oneLiner: string | null;
  difficulty: string | null;
  estimatedMinutes: number | null;
  moduleCount: number | null;
  createdBy: string;
  createdAt: string;
}

interface Assignment {
  id: string;
  courseId: string;
  assignedTo: string;
  assignedBy: string;
  dueDate: string | null;
  note: string | null;
  createdAt: string;
  status: "not_started" | "in_progress" | "completed";
  percentComplete: number;
}

interface OrgData {
  organization: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    ownerId: string;
    slackWebhookUrl: string | null;
    maxMembers: number;
  };
  members: OrgMember[];
  courses: OrgCourse[];
  assignments: Assignment[];
  stats: {
    memberCount: number;
    courseCount: number;
    totalAssignments: number;
    completedAssignments: number;
    completionRate: number;
  };
}

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  owner: { bg: "var(--accent-light)", color: "var(--accent)" },
  admin: { bg: "#F0F4FF", color: "#4A5BC7" },
  member: { bg: "var(--bg-secondary)", color: "var(--text-secondary)" },
};

const AUDIENCE_LABELS: Record<string, string> = {
  vibe_coder: "Vibe Coder",
  new_engineer: "New Engineer",
  product_manager: "PM",
  security_auditor: "Security",
};

async function fetchOrg(slug: string): Promise<OrgData> {
  const res = await fetch(`/api/org/${slug}`, { credentials: "include" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Failed to load" }));
    throw new Error(data.error || "Failed to load organization");
  }
  return res.json();
}

export default function OrgDashboard() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, login, user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"members" | "courses" | "completion">("members");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState<string | null>(null);
  const [inviteInput, setInviteInput] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [assignDue, setAssignDue] = useState("");
  const [assignNote, setAssignNote] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) login();
  }, [authLoading, isAuthenticated, login]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["org", slug],
    queryFn: () => fetchOrg(slug),
    enabled: isAuthenticated && !!slug,
  });

  const inviteMutation = useMutation({
    mutationFn: async (usernameOrEmail: string) => {
      const res = await fetch(`/api/org/${slug}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ usernameOrEmail }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to invite");
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org", slug] });
      showToast("Invitation sent!", "success");
      setShowInviteModal(false);
      setInviteInput("");
    },
    onError: (err) => showToast(err instanceof Error ? err.message : "Failed to invite", "error"),
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await fetch(`/api/org/${slug}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to change role");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org", slug] });
      showToast("Role updated", "success");
    },
    onError: (err) => showToast(err instanceof Error ? err.message : "Failed", "error"),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/org/${slug}/members/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to remove");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org", slug] });
      showToast("Member removed", "success");
    },
    onError: (err) => showToast(err instanceof Error ? err.message : "Failed", "error"),
  });

  const assignMutation = useMutation({
    mutationFn: async ({ courseId, assignedTo, dueDate, note }: {
      courseId: string;
      assignedTo: string;
      dueDate?: string;
      note?: string;
    }) => {
      const res = await fetch(`/api/org/${slug}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ courseId, assignedTo, dueDate, note }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to assign");
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org", slug] });
      showToast("Course assigned!", "success");
      setShowAssignModal(null);
      setAssignTo("");
      setAssignDue("");
      setAssignNote("");
    },
    onError: (err) => showToast(err instanceof Error ? err.message : "Failed", "error"),
  });

  if (authLoading || isLoading) {
    return (
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
        <div className="skeleton" style={{ width: 300, height: 32, marginBottom: "1rem" }} />
        <div className="skeleton" style={{ width: "100%", height: 200 }} />
      </main>
    );
  }

  if (error || !data) {
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
          {error instanceof Error ? error.message : "Organization not found"}
        </h2>
        <Link href="/dashboard" className="btn-secondary" style={{ textDecoration: "none" }}>
          Back to Dashboard
        </Link>
      </main>
    );
  }

  const { organization: org, members, courses, assignments, stats } = data;
  const activeMembers = members.filter((m) => m.status === "active");
  const isAdmin = members.find((m) => m.userId === user?.id && (m.role === "owner" || m.role === "admin"));

  const tabs = [
    { key: "members" as const, label: `Members (${activeMembers.length})` },
    { key: "courses" as const, label: `Courses (${courses.length})` },
    { key: "completion" as const, label: "Completion" },
  ];

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "1.5rem",
        flexWrap: "wrap",
        gap: "1rem",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.75rem", fontWeight: 700 }}>
              {org.name}
            </h1>
            <span className="badge" style={{ background: "var(--teal-light)", color: "var(--teal)" }}>
              {org.plan}
            </span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            {stats.memberCount} members · {stats.courseCount} courses · {stats.completionRate}% completion rate
          </p>
        </div>
        {isAdmin && (
          <Link href={`/org/${slug}/settings`} className="btn-secondary" style={{ textDecoration: "none", fontSize: "0.85rem" }}>
            Settings
          </Link>
        )}
      </div>

      <div style={{
        display: "flex",
        gap: "0.25rem",
        borderBottom: "2px solid var(--border-color)",
        marginBottom: "1.5rem",
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "0.625rem 1rem",
              fontSize: "0.85rem",
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? "var(--accent)" : "var(--text-secondary)",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
              cursor: "pointer",
              marginBottom: "-2px",
              fontFamily: "var(--font-body)",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "members" && (
        <div>
          {isAdmin && (
            <button
              className="btn-primary"
              onClick={() => setShowInviteModal(true)}
              style={{ marginBottom: "1rem", fontSize: "0.85rem" }}
            >
              + Invite Member
            </button>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {members.map((member) => {
              const roleStyle = ROLE_COLORS[member.role] || ROLE_COLORS.member;
              return (
                <div key={member.id} className="card" style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    {member.avatarUrl ? (
                      <img src={member.avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: "50%" }} />
                    ) : (
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "var(--bg-secondary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                      }}>
                        {member.displayName.charAt(0)}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>
                        {member.displayName}
                        {member.status === "pending" && (
                          <span style={{ fontSize: "0.75rem", color: "var(--warning)", marginLeft: "0.5rem" }}>
                            (pending)
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                        @{member.username}
                        {member.joinedAt && (
                          <span style={{ marginLeft: "0.5rem" }}>
                            · Joined {new Date(member.joinedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {isAdmin && member.userId !== org.ownerId && member.role !== "owner" ? (
                      <select
                        value={member.role}
                        onChange={(e) => changeRoleMutation.mutate({ userId: member.userId, role: e.target.value })}
                        style={{
                          padding: "0.25rem 0.5rem",
                          fontSize: "0.75rem",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-color)",
                          background: roleStyle.bg,
                          color: roleStyle.color,
                          fontWeight: 500,
                          fontFamily: "var(--font-body)",
                          cursor: "pointer",
                        }}
                      >
                        <option value="member">member</option>
                        <option value="admin">admin</option>
                      </select>
                    ) : (
                      <span className="badge" style={{ background: roleStyle.bg, color: roleStyle.color }}>
                        {member.role}
                      </span>
                    )}
                    {isAdmin && member.userId !== org.ownerId && member.userId !== user?.id && (
                      <button
                        className="btn-ghost"
                        onClick={() => {
                          if (confirm(`Remove ${member.displayName} from ${org.name}?`)) {
                            removeMemberMutation.mutate(member.userId);
                          }
                        }}
                        style={{ fontSize: "0.75rem", color: "var(--error)" }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "courses" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: "1rem" }}>
          {courses.length === 0 ? (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
              No courses generated yet. Team members can generate courses from the homepage.
            </div>
          ) : (
            courses.map((course) => (
              <div key={course.id} className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <code style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    background: "var(--bg-secondary)",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "var(--radius-sm)",
                  }}>
                    {course.ownerName}/{course.repoName}
                  </code>
                  <span className="badge" style={{
                    background: course.status === "completed" ? "var(--teal-light)" : "var(--bg-secondary)",
                    color: course.status === "completed" ? "var(--teal)" : "var(--text-secondary)",
                  }}>
                    {course.status}
                  </span>
                </div>
                {course.oneLiner && (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    {course.oneLiner}
                  </p>
                )}
                <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                  <span className="badge" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                    {AUDIENCE_LABELS[course.targetAudience] || course.targetAudience}
                  </span>
                  {course.difficulty && (
                    <span className="badge" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
                      {course.difficulty}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "auto", paddingTop: "0.5rem", borderTop: "1px solid var(--border-color)" }}>
                  {course.status === "completed" && (
                    <Link href={`/course/${course.id}`} className="btn-secondary" style={{
                      flex: 1,
                      textAlign: "center",
                      textDecoration: "none",
                      fontSize: "0.8rem",
                      padding: "0.375rem 0.5rem",
                    }}>
                      View
                    </Link>
                  )}
                  {course.status === "completed" && isAdmin && (
                    <button
                      className="btn-primary"
                      onClick={() => setShowAssignModal(course.id)}
                      style={{ flex: 1, fontSize: "0.8rem", padding: "0.375rem 0.5rem" }}
                    >
                      Assign
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "completion" && (() => {
        const assignedCourseIds = [...new Set(assignments.map((a) => a.courseId))];
        const assignedCourses = courses.filter((c) => assignedCourseIds.includes(c.id));
        const assignedMemberIds = [...new Set(assignments.map((a) => a.assignedTo))];
        const assignedMembers = activeMembers.filter((m) => assignedMemberIds.includes(m.userId));

        if (assignedCourses.length === 0 || assignedMembers.length === 0) {
          return (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
              No assignments yet. Go to the Courses tab to assign courses to team members.
            </div>
          );
        }

        return (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr>
                  <th style={{
                    textAlign: "left",
                    padding: "0.625rem 0.5rem",
                    borderBottom: "2px solid var(--border-color)",
                    fontWeight: 600,
                    minWidth: 140,
                    position: "sticky",
                    left: 0,
                    background: "var(--bg-primary)",
                    zIndex: 1,
                  }}>
                    Member
                  </th>
                  {assignedCourses.map((c) => (
                    <th key={c.id} style={{
                      textAlign: "center",
                      padding: "0.625rem 0.5rem",
                      borderBottom: "2px solid var(--border-color)",
                      fontWeight: 600,
                      minWidth: 120,
                    }}>
                      <code style={{ fontSize: "0.7rem" }}>{c.repoName}</code>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assignedMembers.map((member) => (
                  <tr key={member.userId}>
                    <td style={{
                      padding: "0.625rem 0.5rem",
                      borderBottom: "1px solid var(--border-color)",
                      position: "sticky",
                      left: 0,
                      background: "var(--bg-primary)",
                      zIndex: 1,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {member.avatarUrl ? (
                          <img src={member.avatarUrl} alt="" style={{ width: 22, height: 22, borderRadius: "50%" }} />
                        ) : (
                          <div style={{
                            width: 22, height: 22, borderRadius: "50%",
                            background: "var(--bg-secondary)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "0.6rem", fontWeight: 600,
                          }}>
                            {member.displayName.charAt(0)}
                          </div>
                        )}
                        <span style={{ fontSize: "0.8rem" }}>{member.displayName}</span>
                      </div>
                    </td>
                    {assignedCourses.map((course) => {
                      const a = assignments.find(
                        (asn) => asn.assignedTo === member.userId && asn.courseId === course.id
                      );
                      return (
                        <td key={course.id} style={{
                          padding: "0.5rem",
                          borderBottom: "1px solid var(--border-color)",
                          textAlign: "center",
                        }}>
                          {!a ? (
                            <span style={{ color: "var(--text-tertiary)" }}>—</span>
                          ) : a.status === "completed" ? (
                            <span className="badge" style={{ background: "var(--teal-light)", color: "var(--teal)" }}>
                              Completed
                            </span>
                          ) : a.status === "in_progress" ? (
                            <span className="badge" style={{ background: "#FFF8E1", color: "var(--warning)" }}>
                              In Progress ({a.percentComplete}%)
                            </span>
                          ) : (
                            <span className="badge" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
                              Not Started
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {showInviteModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowInviteModal(false)}>
          <div className="modal-content">
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem" }}>
              Invite Member
            </h3>
            <form onSubmit={(e) => { e.preventDefault(); inviteMutation.mutate(inviteInput); }}>
              <input
                type="text"
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
                placeholder="Username or email"
                required
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  border: "2px solid var(--border-color)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "0.9rem",
                  marginBottom: "1rem",
                  fontFamily: "var(--font-body)",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button type="button" className="btn-ghost" onClick={() => setShowInviteModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={inviteMutation.isPending || !inviteInput}>
                  {inviteMutation.isPending ? "Inviting..." : "Send Invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAssignModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAssignModal(null)}>
          <div className="modal-content">
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem" }}>
              Assign Course
            </h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              assignMutation.mutate({
                courseId: showAssignModal,
                assignedTo: assignTo,
                dueDate: assignDue || undefined,
                note: assignNote || undefined,
              });
            }}>
              <div style={{ marginBottom: "0.75rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, marginBottom: "0.25rem" }}>
                  Assign to
                </label>
                <select
                  value={assignTo}
                  onChange={(e) => setAssignTo(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "0.625rem 0.75rem",
                    border: "2px solid var(--border-color)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.9rem",
                    fontFamily: "var(--font-body)",
                    outline: "none",
                    background: "white",
                  }}
                >
                  <option value="">Select a member</option>
                  {activeMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName} (@{m.username})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: "0.75rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, marginBottom: "0.25rem" }}>
                  Due date (optional)
                </label>
                <input
                  type="date"
                  value={assignDue}
                  onChange={(e) => setAssignDue(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.625rem 0.75rem",
                    border: "2px solid var(--border-color)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.9rem",
                    fontFamily: "var(--font-body)",
                    outline: "none",
                  }}
                />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, marginBottom: "0.25rem" }}>
                  Note (optional)
                </label>
                <textarea
                  value={assignNote}
                  onChange={(e) => setAssignNote(e.target.value)}
                  placeholder="e.g., Focus on the security modules"
                  rows={2}
                  style={{
                    width: "100%",
                    padding: "0.625rem 0.75rem",
                    border: "2px solid var(--border-color)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.85rem",
                    fontFamily: "var(--font-body)",
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button type="button" className="btn-ghost" onClick={() => setShowAssignModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={assignMutation.isPending || !assignTo}>
                  {assignMutation.isPending ? "Assigning..." : "Assign Course"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
