export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { requireOrgMembership } from "@/lib/org-helpers";
import { db } from "@workspace/db";
import {
  organizationMembers,
  courses,
  courseAssignments,
  courseProgress,
  users,
  userSkills,
  learningPaths,
  learningPathAssignments,
} from "@workspace/db/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";

function escapeCsvField(value: string): string {
  const dangerous = /^[=+\-@\t\r]/;
  let safe = value;
  if (dangerous.test(safe)) {
    safe = "'" + safe;
  }
  if (safe.includes('"') || safe.includes(",") || safe.includes("\n") || safe.includes("\r")) {
    safe = '"' + safe.replace(/"/g, '""') + '"';
  } else if (dangerous.test(value)) {
    safe = '"' + safe + '"';
  }
  return safe;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { slug } = await params;
  const result = await requireOrgMembership(slug, user.id, "admin");
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { org } = result;

  const members = await db
    .select({
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      status: organizationMembers.status,
      username: users.username,
      displayName: users.displayName,
      email: users.email,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, org.id));

  const orgCourses = await db
    .select({ id: courses.id, repoName: courses.repoName, ownerName: courses.ownerName })
    .from(courses)
    .where(and(eq(courses.organizationId, org.id), isNull(courses.deletedAt)));

  const courseIds = orgCourses.map((c) => c.id);
  const memberIds = members.map((m) => m.userId);

  let progressRecords: Array<typeof courseProgress.$inferSelect> = [];
  if (courseIds.length > 0 && memberIds.length > 0) {
    progressRecords = await db
      .select()
      .from(courseProgress)
      .where(and(inArray(courseProgress.courseId, courseIds), inArray(courseProgress.userId, memberIds)));
  }

  let skills: Array<typeof userSkills.$inferSelect> = [];
  if (memberIds.length > 0) {
    skills = await db
      .select()
      .from(userSkills)
      .where(inArray(userSkills.userId, memberIds));
  }

  const courseMap = Object.fromEntries(orgCourses.map((c) => [c.id, c]));

  const rows: string[] = [];
  rows.push("Username,Display Name,Email,Role,Status,Course,Progress (%),Skills Acquired");

  for (const member of members) {
    const memberProgress = progressRecords.filter((p) => p.userId === member.userId);
    const memberSkills = skills.filter((s) => s.userId === member.userId).map((s) => s.skill);

    if (memberProgress.length === 0) {
      rows.push(
        [
          escapeCsvField(member.username),
          escapeCsvField(member.displayName),
          escapeCsvField(member.email || ""),
          escapeCsvField(member.role),
          escapeCsvField(member.status),
          "",
          "0",
          escapeCsvField(memberSkills.join(", ")),
        ].join(",")
      );
    } else {
      for (const prog of memberProgress) {
        const course = courseMap[prog.courseId];
        rows.push(
          [
            escapeCsvField(member.username),
            escapeCsvField(member.displayName),
            escapeCsvField(member.email || ""),
            escapeCsvField(member.role),
            escapeCsvField(member.status),
            escapeCsvField(course ? `${course.ownerName}/${course.repoName}` : prog.courseId),
            String(prog.percentComplete),
            escapeCsvField(memberSkills.join(", ")),
          ].join(",")
        );
      }
    }
  }

  const csv = rows.join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${slug}-report-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
