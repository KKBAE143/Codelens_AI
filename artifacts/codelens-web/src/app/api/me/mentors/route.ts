export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { mentorAssignments, users, courses, learningPaths } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const myMentors = await db
    .select()
    .from(mentorAssignments)
    .where(eq(mentorAssignments.learnerUserId, user.id));

  const myLearners = await db
    .select()
    .from(mentorAssignments)
    .where(eq(mentorAssignments.mentorUserId, user.id));

  const allUserIds = [...new Set([
    ...myMentors.map((m) => m.mentorUserId),
    ...myLearners.map((m) => m.learnerUserId),
  ])];

  let userMap: Record<string, { displayName: string; username: string; avatarUrl: string | null }> = {};
  if (allUserIds.length > 0) {
    const usersData = await db
      .select({ id: users.id, displayName: users.displayName, username: users.username, avatarUrl: users.avatarUrl })
      .from(users)
      .where(inArray(users.id, allUserIds));
    userMap = Object.fromEntries(usersData.map((u) => [u.id, u]));
  }

  return NextResponse.json({
    mentors: myMentors.map((m) => ({
      ...m,
      mentor: userMap[m.mentorUserId] || null,
    })),
    learners: myLearners.map((m) => ({
      ...m,
      learner: userMap[m.learnerUserId] || null,
    })),
  });
}
