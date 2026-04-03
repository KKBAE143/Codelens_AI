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

interface LearningPath {
  id: string;
  name: string;
  description: string | null;
  courseIds: string[];
  assignmentCount: number;
  createdAt: string;
}

interface GapAnalysisItem {
  skill: string;
  roleLabel: string | null;
  totalMembers: number;
  membersWithSkill: number;
  membersWithout: number;
  coveragePercent: number;
}

interface SkillsData {
  requiredSkills: Array<{ id: string; skill: string; roleLabel: string | null }>;
  gapAnalysis: GapAnalysisItem[];
  availableSkills: string[];
  courseSkillMap: Array<{ courseId: string; repoName: string; skills: string[] }>;
}

interface MentorData {
  id: string;
  mentorUserId: string;
  learnerUserId: string;
  courseId: string | null;
  learningPathId: string | null;
  createdAt: string;
  mentor: { displayName: string; username: string; avatarUrl: string | null } | null;
  learner: { displayName: string; username: string; avatarUrl: string | null } | null;
}

type TabKey = "members" | "courses" | "completion" | "paths" | "skills" | "mentors";

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
  const [activeTab, setActiveTab] = useState<TabKey>("members");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState<string | null>(null);
  const [inviteInput, setInviteInput] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [assignDue, setAssignDue] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [showCreatePath, setShowCreatePath] = useState(false);
  const [pathName, setPathName] = useState("");
  const [pathDesc, setPathDesc] = useState("");
  const [pathCourseIds, setPathCourseIds] = useState<string[]>([]);
  const [showAssignPath, setShowAssignPath] = useState<string | null>(null);
  const [pathAssignUsers, setPathAssignUsers] = useState<string[]>([]);
  const [pathAssignDue, setPathAssignDue] = useState("");
  const [newSkill, setNewSkill] = useState("");
  const [newSkillRole, setNewSkillRole] = useState("");
  const [showAddMentor, setShowAddMentor] = useState(false);
  const [mentorId, setMentorId] = useState("");
  const [learnerId, setLearnerId] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) login();
  }, [authLoading, isAuthenticated, login]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["org", slug],
    queryFn: () => fetchOrg(slug),
    enabled: isAuthenticated && !!slug,
  });

  const { data: pathsData } = useQuery({
    queryKey: ["org-paths", slug],
    queryFn: async () => {
      const res = await fetch(`/api/org/${slug}/learning-paths`, { credentials: "include" });
      return res.ok ? res.json() : { learningPaths: [] };
    },
    enabled: isAuthenticated && !!slug && (activeTab === "paths" || activeTab === "skills"),
  });

  const { data: skillsData } = useQuery<SkillsData>({
    queryKey: ["org-skills", slug],
    queryFn: async () => {
      const res = await fetch(`/api/org/${slug}/skills`, { credentials: "include" });
      return res.ok ? res.json() : { requiredSkills: [], gapAnalysis: [], availableSkills: [], courseSkillMap: [] };
    },
    enabled: isAuthenticated && !!slug && activeTab === "skills",
  });

  const { data: mentorsData } = useQuery({
    queryKey: ["org-mentors", slug],
    queryFn: async () => {
      const res = await fetch(`/api/org/${slug}/mentors`, { credentials: "include" });
      return res.ok ? res.json() : { mentorAssignments: [] };
    },
    enabled: isAuthenticated && !!slug && activeTab === "mentors",
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

  const createPathMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/org/${slug}/learning-paths`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: pathName, description: pathDesc || undefined, courseIds: pathCourseIds }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to create");
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-paths", slug] });
      showToast("Learning path created!", "success");
      setShowCreatePath(false);
      setPathName("");
      setPathDesc("");
      setPathCourseIds([]);
    },
    onError: (err) => showToast(err instanceof Error ? err.message : "Failed", "error"),
  });

  const assignPathMutation = useMutation({
    mutationFn: async (pathId: string) => {
      const res = await fetch(`/api/org/${slug}/learning-paths/${pathId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userIds: pathAssignUsers, dueDate: pathAssignDue || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to assign");
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-paths", slug] });
      showToast("Path assigned!", "success");
      setShowAssignPath(null);
      setPathAssignUsers([]);
      setPathAssignDue("");
    },
    onError: (err) => showToast(err instanceof Error ? err.message : "Failed", "error"),
  });

  const deletePathMutation = useMutation({
    mutationFn: async (pathId: string) => {
      const res = await fetch(`/api/org/${slug}/learning-paths/${pathId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-paths", slug] });
      showToast("Learning path deleted", "success");
    },
    onError: (err) => showToast(err instanceof Error ? err.message : "Failed", "error"),
  });

  const addSkillMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/org/${slug}/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ skill: newSkill, roleLabel: newSkillRole || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to add");
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-skills", slug] });
      showToast("Required skill added", "success");
      setNewSkill("");
      setNewSkillRole("");
    },
    onError: (err) => showToast(err instanceof Error ? err.message : "Failed", "error"),
  });

  const removeSkillMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/org/${slug}/skills?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-skills", slug] });
      showToast("Skill removed", "success");
    },
  });

  const addMentorMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/org/${slug}/mentors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mentorUserId: mentorId, learnerUserId: learnerId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to assign mentor");
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-mentors", slug] });
      showToast("Mentor assigned!", "success");
      setShowAddMentor(false);
      setMentorId("");
      setLearnerId("");
    },
    onError: (err) => showToast(err instanceof Error ? err.message : "Failed", "error"),
  });

  const removeMentorMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/org/${slug}/mentors?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-mentors", slug] });
      showToast("Mentor pairing removed", "success");
    },
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
  const completedCourses = courses.filter((c) => c.status === "completed");
  const learningPathsList: LearningPath[] = pathsData?.learningPaths || [];
  const mentorsList: MentorData[] = mentorsData?.mentorAssignments || [];

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "members", label: `Members (${activeMembers.length})` },
    { key: "courses", label: `Courses (${courses.length})` },
    { key: "paths", label: `Paths (${learningPathsList.length})` },
    { key: "completion", label: "Completion" },
    { key: "skills", label: "Skill Gap" },
    { key: "mentors", label: `Mentors (${mentorsList.length})` },
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
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {isAdmin && (
            <a
              href={`/api/org/${slug}/export`}
              className="btn-secondary"
              style={{ textDecoration: "none", fontSize: "0.85rem" }}
            >
              Export CSV
            </a>
          )}
          {isAdmin && (
            <Link href={`/org/${slug}/settings`} className="btn-secondary" style={{ textDecoration: "none", fontSize: "0.85rem" }}>
              Settings
            </Link>
          )}
        </div>
      </div>

      <div role="tablist" style={{
        display: "flex",
        gap: "0.25rem",
        borderBottom: "2px solid var(--border-color)",
        marginBottom: "1.5rem",
        overflowX: "auto",
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
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
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "members" && (
        <MembersTab
          members={members}
          org={org}
          isAdmin={!!isAdmin}
          currentUserId={user?.id}
          onInvite={() => setShowInviteModal(true)}
          onChangeRole={(userId, role) => changeRoleMutation.mutate({ userId, role })}
          onRemove={(userId, name) => {
            if (confirm(`Remove ${name} from ${org.name}?`)) removeMemberMutation.mutate(userId);
          }}
        />
      )}

      {activeTab === "courses" && (
        <CoursesTab
          courses={courses}
          isAdmin={!!isAdmin}
          onAssign={(courseId) => setShowAssignModal(courseId)}
        />
      )}

      {activeTab === "paths" && (
        <PathsTab
          paths={learningPathsList}
          courses={completedCourses}
          activeMembers={activeMembers}
          isAdmin={!!isAdmin}
          onCreatePath={() => setShowCreatePath(true)}
          onDeletePath={(id) => {
            if (confirm("Delete this learning path?")) deletePathMutation.mutate(id);
          }}
          onAssignPath={(id) => setShowAssignPath(id)}
        />
      )}

      {activeTab === "completion" && (
        <CompletionTab courses={courses} assignments={assignments} activeMembers={activeMembers} />
      )}

      {activeTab === "skills" && (
        <SkillsTab
          skillsData={skillsData}
          isAdmin={!!isAdmin}
          newSkill={newSkill}
          newSkillRole={newSkillRole}
          onNewSkillChange={setNewSkill}
          onNewSkillRoleChange={setNewSkillRole}
          onAddSkill={() => addSkillMutation.mutate()}
          onRemoveSkill={(id) => removeSkillMutation.mutate(id)}
          addPending={addSkillMutation.isPending}
        />
      )}

      {activeTab === "mentors" && (
        <MentorsTab
          mentors={mentorsList}
          isAdmin={!!isAdmin}
          onAdd={() => setShowAddMentor(true)}
          onRemove={(id) => {
            if (confirm("Remove this mentor pairing?")) removeMentorMutation.mutate(id);
          }}
        />
      )}

      {showInviteModal && (
        <Modal onClose={() => setShowInviteModal(false)} title="Invite Member">
          <form onSubmit={(e) => { e.preventDefault(); inviteMutation.mutate(inviteInput); }}>
            <input
              type="text"
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              placeholder="Username or email"
              required
              className="input-field"
              style={{ width: "100%", marginBottom: "1rem" }}
            />
            <ModalActions>
              <button type="button" className="btn-ghost" onClick={() => setShowInviteModal(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={inviteMutation.isPending || !inviteInput}>
                {inviteMutation.isPending ? "Inviting..." : "Send Invitation"}
              </button>
            </ModalActions>
          </form>
        </Modal>
      )}

      {showAssignModal && (
        <Modal onClose={() => setShowAssignModal(null)} title="Assign Course">
          <form onSubmit={(e) => {
            e.preventDefault();
            assignMutation.mutate({
              courseId: showAssignModal,
              assignedTo: assignTo,
              dueDate: assignDue || undefined,
              note: assignNote || undefined,
            });
          }}>
            <FormField label="Assign to">
              <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} required className="input-field" style={{ width: "100%" }}>
                <option value="">Select a member</option>
                {activeMembers.map((m) => <option key={m.userId} value={m.userId}>{m.displayName} (@{m.username})</option>)}
              </select>
            </FormField>
            <FormField label="Due date (optional)">
              <input type="date" value={assignDue} onChange={(e) => setAssignDue(e.target.value)} className="input-field" style={{ width: "100%" }} />
            </FormField>
            <FormField label="Note (optional)">
              <textarea value={assignNote} onChange={(e) => setAssignNote(e.target.value)} placeholder="e.g., Focus on the security modules" rows={2} className="input-field" style={{ width: "100%", resize: "vertical" }} />
            </FormField>
            <ModalActions>
              <button type="button" className="btn-ghost" onClick={() => setShowAssignModal(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={assignMutation.isPending || !assignTo}>
                {assignMutation.isPending ? "Assigning..." : "Assign Course"}
              </button>
            </ModalActions>
          </form>
        </Modal>
      )}

      {showCreatePath && (
        <Modal onClose={() => setShowCreatePath(false)} title="Create Learning Path">
          <form onSubmit={(e) => { e.preventDefault(); createPathMutation.mutate(); }}>
            <FormField label="Path name">
              <input type="text" value={pathName} onChange={(e) => setPathName(e.target.value)} required className="input-field" style={{ width: "100%" }} placeholder="e.g., Backend Onboarding" />
            </FormField>
            <FormField label="Description (optional)">
              <textarea value={pathDesc} onChange={(e) => setPathDesc(e.target.value)} rows={2} className="input-field" style={{ width: "100%", resize: "vertical" }} />
            </FormField>
            <FormField label="Select courses (in order)">
              <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", padding: "0.5rem" }}>
                {completedCourses.length === 0 ? (
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", padding: "0.5rem" }}>No completed courses available</p>
                ) : (
                  completedCourses.map((c) => (
                    <label key={c.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.375rem 0.25rem", fontSize: "0.8rem", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={pathCourseIds.includes(c.id)}
                        onChange={(e) => {
                          if (e.target.checked) setPathCourseIds((prev) => [...prev, c.id]);
                          else setPathCourseIds((prev) => prev.filter((id) => id !== c.id));
                        }}
                      />
                      <code style={{ fontSize: "0.75rem" }}>{c.ownerName}/{c.repoName}</code>
                    </label>
                  ))
                )}
              </div>
              {pathCourseIds.length > 0 && (
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                  {pathCourseIds.length} course{pathCourseIds.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </FormField>
            <ModalActions>
              <button type="button" className="btn-ghost" onClick={() => setShowCreatePath(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createPathMutation.isPending || !pathName || pathCourseIds.length === 0}>
                {createPathMutation.isPending ? "Creating..." : "Create Path"}
              </button>
            </ModalActions>
          </form>
        </Modal>
      )}

      {showAssignPath && (
        <Modal onClose={() => setShowAssignPath(null)} title="Assign Learning Path">
          <form onSubmit={(e) => { e.preventDefault(); assignPathMutation.mutate(showAssignPath); }}>
            <FormField label="Assign to members">
              <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", padding: "0.5rem" }}>
                {activeMembers.map((m) => (
                  <label key={m.userId} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.375rem 0.25rem", fontSize: "0.8rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={pathAssignUsers.includes(m.userId)}
                      onChange={(e) => {
                        if (e.target.checked) setPathAssignUsers((prev) => [...prev, m.userId]);
                        else setPathAssignUsers((prev) => prev.filter((id) => id !== m.userId));
                      }}
                    />
                    {m.displayName} (@{m.username})
                  </label>
                ))}
              </div>
            </FormField>
            <FormField label="Due date (optional)">
              <input type="date" value={pathAssignDue} onChange={(e) => setPathAssignDue(e.target.value)} className="input-field" style={{ width: "100%" }} />
            </FormField>
            <ModalActions>
              <button type="button" className="btn-ghost" onClick={() => setShowAssignPath(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={assignPathMutation.isPending || pathAssignUsers.length === 0}>
                {assignPathMutation.isPending ? "Assigning..." : `Assign to ${pathAssignUsers.length} member${pathAssignUsers.length !== 1 ? "s" : ""}`}
              </button>
            </ModalActions>
          </form>
        </Modal>
      )}

      {showAddMentor && (
        <Modal onClose={() => setShowAddMentor(false)} title="Assign Mentor">
          <form onSubmit={(e) => { e.preventDefault(); addMentorMutation.mutate(); }}>
            <FormField label="Mentor">
              <select value={mentorId} onChange={(e) => setMentorId(e.target.value)} required className="input-field" style={{ width: "100%" }}>
                <option value="">Select mentor</option>
                {activeMembers.map((m) => <option key={m.userId} value={m.userId}>{m.displayName} (@{m.username})</option>)}
              </select>
            </FormField>
            <FormField label="Learner">
              <select value={learnerId} onChange={(e) => setLearnerId(e.target.value)} required className="input-field" style={{ width: "100%" }}>
                <option value="">Select learner</option>
                {activeMembers.filter((m) => m.userId !== mentorId).map((m) => (
                  <option key={m.userId} value={m.userId}>{m.displayName} (@{m.username})</option>
                ))}
              </select>
            </FormField>
            <ModalActions>
              <button type="button" className="btn-ghost" onClick={() => setShowAddMentor(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={addMentorMutation.isPending || !mentorId || !learnerId}>
                {addMentorMutation.isPending ? "Assigning..." : "Assign Mentor"}
              </button>
            </ModalActions>
          </form>
        </Modal>
      )}
    </main>
  );
}

function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem" }}>
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>{children}</div>;
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, marginBottom: "0.25rem" }}>{label}</label>
      {children}
    </div>
  );
}

function Avatar({ src, name, size = 32 }: { src: string | null; name: string; size?: number }) {
  if (src) return <img src={src} alt="" style={{ width: size, height: size, borderRadius: "50%" }} />;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "var(--bg-secondary)", display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: size * 0.38, fontWeight: 600,
    }}>
      {name.charAt(0)}
    </div>
  );
}

function MembersTab({ members, org, isAdmin, currentUserId, onInvite, onChangeRole, onRemove }: {
  members: OrgMember[];
  org: OrgData["organization"];
  isAdmin: boolean;
  currentUserId?: string;
  onInvite: () => void;
  onChangeRole: (userId: string, role: string) => void;
  onRemove: (userId: string, name: string) => void;
}) {
  return (
    <div>
      {isAdmin && (
        <button className="btn-primary" onClick={onInvite} style={{ marginBottom: "1rem", fontSize: "0.85rem" }}>
          + Invite Member
        </button>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {members.map((member) => {
          const roleStyle = ROLE_COLORS[member.role] || ROLE_COLORS.member;
          return (
            <div key={member.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <Avatar src={member.avatarUrl} name={member.displayName} />
                <div>
                  <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>
                    {member.displayName}
                    {member.status === "pending" && <span style={{ fontSize: "0.75rem", color: "var(--warning)", marginLeft: "0.5rem" }}>(pending)</span>}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                    @{member.username}
                    {member.joinedAt && <span style={{ marginLeft: "0.5rem" }}>· Joined {new Date(member.joinedAt).toLocaleDateString()}</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {isAdmin && member.userId !== org.ownerId && member.role !== "owner" ? (
                  <select
                    value={member.role}
                    onChange={(e) => onChangeRole(member.userId, e.target.value)}
                    style={{
                      padding: "0.25rem 0.5rem", fontSize: "0.75rem", borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-color)", background: roleStyle.bg, color: roleStyle.color,
                      fontWeight: 500, fontFamily: "var(--font-body)", cursor: "pointer",
                    }}
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                ) : (
                  <span className="badge" style={{ background: roleStyle.bg, color: roleStyle.color }}>{member.role}</span>
                )}
                {isAdmin && member.userId !== org.ownerId && member.userId !== currentUserId && (
                  <button className="btn-ghost" onClick={() => onRemove(member.userId, member.displayName)} style={{ fontSize: "0.75rem", color: "var(--error)" }}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CoursesTab({ courses, isAdmin, onAssign }: {
  courses: OrgCourse[];
  isAdmin: boolean;
  onAssign: (courseId: string) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: "1rem" }}>
      {courses.length === 0 ? (
        <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
          No courses generated yet. Team members can generate courses from the homepage.
        </div>
      ) : (
        courses.map((course) => (
          <div key={course.id} className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <code style={{ fontSize: "0.8rem", fontWeight: 600, background: "var(--bg-secondary)", padding: "0.15rem 0.5rem", borderRadius: "var(--radius-sm)" }}>
                {course.ownerName}/{course.repoName}
              </code>
              <span className="badge" style={{
                background: course.status === "completed" ? "var(--teal-light)" : "var(--bg-secondary)",
                color: course.status === "completed" ? "var(--teal)" : "var(--text-secondary)",
              }}>
                {course.status}
              </span>
            </div>
            {course.oneLiner && <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>{course.oneLiner}</p>}
            <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
              <span className="badge" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                {AUDIENCE_LABELS[course.targetAudience] || course.targetAudience}
              </span>
              {course.difficulty && <span className="badge" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>{course.difficulty}</span>}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "auto", paddingTop: "0.5rem", borderTop: "1px solid var(--border-color)" }}>
              {course.status === "completed" && (
                <Link href={`/course/${course.id}`} className="btn-secondary" style={{ flex: 1, textAlign: "center", textDecoration: "none", fontSize: "0.8rem", padding: "0.375rem 0.5rem" }}>
                  View
                </Link>
              )}
              {course.status === "completed" && isAdmin && (
                <button className="btn-primary" onClick={() => onAssign(course.id)} style={{ flex: 1, fontSize: "0.8rem", padding: "0.375rem 0.5rem" }}>
                  Assign
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function PathsTab({ paths, courses, activeMembers, isAdmin, onCreatePath, onDeletePath, onAssignPath }: {
  paths: LearningPath[];
  courses: OrgCourse[];
  activeMembers: OrgMember[];
  isAdmin: boolean;
  onCreatePath: () => void;
  onDeletePath: (id: string) => void;
  onAssignPath: (id: string) => void;
}) {
  const courseMap = Object.fromEntries(courses.map((c) => [c.id, c]));
  return (
    <div>
      {isAdmin && (
        <button className="btn-primary" onClick={onCreatePath} style={{ marginBottom: "1rem", fontSize: "0.85rem" }}>
          + Create Learning Path
        </button>
      )}
      {paths.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
          No learning paths yet. Create one to structure onboarding for your team.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {paths.map((path) => (
            <div key={path.id} className="card" style={{ padding: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                <div>
                  <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "1rem", fontWeight: 600 }}>{path.name}</h3>
                  {path.description && <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>{path.description}</p>}
                </div>
                <span className="badge" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                  {path.assignmentCount} assigned
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                {path.courseIds.map((cid, i) => {
                  const c = courseMap[cid];
                  return (
                    <span key={cid} className="badge" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)", fontSize: "0.7rem" }}>
                      {i + 1}. {c ? `${c.ownerName}/${c.repoName}` : "Unknown"}
                    </span>
                  );
                })}
              </div>
              {isAdmin && (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="btn-primary" onClick={() => onAssignPath(path.id)} style={{ fontSize: "0.8rem", padding: "0.375rem 0.75rem" }}>
                    Assign to Members
                  </button>
                  <button className="btn-ghost" onClick={() => onDeletePath(path.id)} style={{ fontSize: "0.8rem", color: "var(--error)" }}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompletionTab({ courses, assignments, activeMembers }: {
  courses: OrgCourse[];
  assignments: Assignment[];
  activeMembers: OrgMember[];
}) {
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
            <th style={{ textAlign: "left", padding: "0.625rem 0.5rem", borderBottom: "2px solid var(--border-color)", fontWeight: 600, minWidth: 140, position: "sticky", left: 0, background: "var(--bg-primary)", zIndex: 1 }}>
              Member
            </th>
            {assignedCourses.map((c) => (
              <th key={c.id} style={{ textAlign: "center", padding: "0.625rem 0.5rem", borderBottom: "2px solid var(--border-color)", fontWeight: 600, minWidth: 120 }}>
                <code style={{ fontSize: "0.7rem" }}>{c.repoName}</code>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {assignedMembers.map((member) => (
            <tr key={member.userId}>
              <td style={{ padding: "0.625rem 0.5rem", borderBottom: "1px solid var(--border-color)", position: "sticky", left: 0, background: "var(--bg-primary)", zIndex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Avatar src={member.avatarUrl} name={member.displayName} size={22} />
                  <span style={{ fontSize: "0.8rem" }}>{member.displayName}</span>
                </div>
              </td>
              {assignedCourses.map((course) => {
                const a = assignments.find((asn) => asn.assignedTo === member.userId && asn.courseId === course.id);
                return (
                  <td key={course.id} style={{ padding: "0.5rem", borderBottom: "1px solid var(--border-color)", textAlign: "center" }}>
                    {!a ? (
                      <span style={{ color: "var(--text-tertiary)" }}>—</span>
                    ) : a.status === "completed" ? (
                      <span className="badge" style={{ background: "var(--teal-light)", color: "var(--teal)" }}>Completed</span>
                    ) : a.status === "in_progress" ? (
                      <span className="badge" style={{ background: "#FFF8E1", color: "var(--warning)" }}>In Progress ({a.percentComplete}%)</span>
                    ) : (
                      <span className="badge" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>Not Started</span>
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
}

function SkillsTab({ skillsData, isAdmin, newSkill, newSkillRole, onNewSkillChange, onNewSkillRoleChange, onAddSkill, onRemoveSkill, addPending }: {
  skillsData?: SkillsData;
  isAdmin: boolean;
  newSkill: string;
  newSkillRole: string;
  onNewSkillChange: (v: string) => void;
  onNewSkillRoleChange: (v: string) => void;
  onAddSkill: () => void;
  onRemoveSkill: (id: string) => void;
  addPending: boolean;
}) {
  if (!skillsData) {
    return <div className="skeleton" style={{ width: "100%", height: 200 }} />;
  }

  return (
    <div>
      {isAdmin && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.25rem" }}>Required Skill</label>
            <input type="text" value={newSkill} onChange={(e) => onNewSkillChange(e.target.value)} placeholder="e.g., React" className="input-field" style={{ width: 180 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.25rem" }}>Role (optional)</label>
            <input type="text" value={newSkillRole} onChange={(e) => onNewSkillRoleChange(e.target.value)} placeholder="e.g., Frontend" className="input-field" style={{ width: 140 }} />
          </div>
          <button className="btn-primary" onClick={onAddSkill} disabled={addPending || !newSkill} style={{ fontSize: "0.8rem", padding: "0.5rem 1rem" }}>
            + Add
          </button>
        </div>
      )}

      {skillsData.gapAnalysis.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>
          {isAdmin ? "Add required skills above to see the gap analysis for your team." : "No required skills configured yet."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "1rem", fontWeight: 600, marginBottom: "0.25rem" }}>
            Skill Gap Analysis
          </h3>
          {skillsData.gapAnalysis.map((gap) => (
            <div key={gap.skill} className="card" style={{ padding: "0.75rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{gap.skill}</span>
                  {gap.roleLabel && <span className="badge" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)", fontSize: "0.65rem" }}>{gap.roleLabel}</span>}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                  {gap.membersWithSkill}/{gap.totalMembers} members · {gap.membersWithout} need training
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ width: 80, height: 6, background: "var(--bg-secondary)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    width: `${gap.coveragePercent}%`, height: "100%", borderRadius: 3,
                    background: gap.coveragePercent >= 80 ? "var(--teal)" : gap.coveragePercent >= 50 ? "var(--warning)" : "var(--error)",
                  }} />
                </div>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, width: 40, textAlign: "right" }}>{gap.coveragePercent}%</span>
                {isAdmin && (
                  <button className="btn-ghost" onClick={() => {
                    const rs = skillsData.requiredSkills.find((s) => s.skill === gap.skill);
                    if (rs) onRemoveSkill(rs.id);
                  }} style={{ fontSize: "0.7rem", color: "var(--error)", padding: "0.25rem" }}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {skillsData.availableSkills.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Skills From Courses
          </h3>
          <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
            {skillsData.availableSkills.map((skill) => (
              <span key={skill} className="badge" style={{ background: "var(--accent-light)", color: "var(--accent)", fontSize: "0.7rem" }}>
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MentorsTab({ mentors, isAdmin, onAdd, onRemove }: {
  mentors: MentorData[];
  isAdmin: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      {isAdmin && (
        <button className="btn-primary" onClick={onAdd} style={{ marginBottom: "1rem", fontSize: "0.85rem" }}>
          + Assign Mentor
        </button>
      )}
      {mentors.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
          No mentor pairings yet. Assign mentors to help learners through their courses.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {mentors.map((m) => (
            <div key={m.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {m.mentor && <Avatar src={m.mentor.avatarUrl} name={m.mentor.displayName} size={28} />}
                  <div>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Mentor</div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 500 }}>{m.mentor?.displayName || "Unknown"}</div>
                  </div>
                </div>
                <span style={{ color: "var(--text-tertiary)", fontSize: "1.2rem" }}>→</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {m.learner && <Avatar src={m.learner.avatarUrl} name={m.learner.displayName} size={28} />}
                  <div>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Learner</div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 500 }}>{m.learner?.displayName || "Unknown"}</div>
                  </div>
                </div>
              </div>
              {isAdmin && (
                <button className="btn-ghost" onClick={() => onRemove(m.id)} style={{ fontSize: "0.75rem", color: "var(--error)" }}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
