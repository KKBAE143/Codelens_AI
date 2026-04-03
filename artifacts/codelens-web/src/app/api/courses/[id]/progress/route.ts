export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { courseProgress, courses, courseAssignments, organizations, users, moduleQuizScores, userSkills } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { sendSlackNotification, courseCompletedMessage } from "@/lib/slack";
import { sendCourseCompletionEmail, isEmailConfigured } from "@/lib/email";
import { awardXp } from "@/lib/xp";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id: courseId } = await params;
  if (!UUID_RE.test(courseId)) {
    return NextResponse.json({ error: "Invalid course ID" }, { status: 400 });
  }

  const [courseRecord] = await db
    .select({
      id: courses.id,
      createdBy: courses.createdBy,
      isPublic: courses.isPublic,
      organizationId: courses.organizationId,
    })
    .from(courses)
    .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)))
    .limit(1);

  if (!courseRecord) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  let hasAccess = courseRecord.createdBy === user.id || courseRecord.isPublic;
  if (!hasAccess && courseRecord.organizationId) {
    const [assignment] = await db
      .select({ id: courseAssignments.id })
      .from(courseAssignments)
      .where(
        and(
          eq(courseAssignments.courseId, courseId),
          eq(courseAssignments.assignedTo, user.id)
        )
      )
      .limit(1);
    if (assignment) hasAccess = true;
  }
  if (!hasAccess) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const [existing] = await db
    .select()
    .from(courseProgress)
    .where(
      and(
        eq(courseProgress.courseId, courseId),
        eq(courseProgress.userId, user.id)
      )
    )
    .limit(1);

  const quizScoreRows = await db
    .select({ moduleIndex: moduleQuizScores.moduleIndex, score: moduleQuizScores.score })
    .from(moduleQuizScores)
    .where(and(eq(moduleQuizScores.courseId, courseId), eq(moduleQuizScores.userId, user.id)));

  const moduleScores = Object.fromEntries(quizScoreRows.map((r) => [r.moduleIndex, r.score]));

  if (!existing) {
    return NextResponse.json({ completedModules: [], percentComplete: 0, lastSeenVersion: 0, moduleScores });
  }

  return NextResponse.json({
    completedModules: existing.completedModules || [],
    percentComplete: existing.percentComplete,
    completedAt: existing.completedAt,
    lastSeenVersion: existing.lastSeenVersion || 1,
    moduleScores,
    wizardConfig: existing.wizardConfig ?? null,
    doneExercises: existing.doneExercises ?? null,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id: courseId } = await params;
  if (!UUID_RE.test(courseId)) {
    return NextResponse.json({ error: "Invalid course ID" }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { moduleIndex, totalModules, markVersionSeen, wizardConfig, doneExercises } = body;

  if (wizardConfig !== undefined || doneExercises !== undefined) {
    const [existing] = await db
      .select({ id: courseProgress.id })
      .from(courseProgress)
      .where(and(eq(courseProgress.courseId, courseId), eq(courseProgress.userId, user.id)))
      .limit(1);

    const updates: Record<string, unknown> = { lastViewedAt: new Date(), updatedAt: new Date() };
    if (wizardConfig !== undefined) updates.wizardConfig = wizardConfig;
    if (doneExercises !== undefined) updates.doneExercises = doneExercises;

    if (existing) {
      await db.update(courseProgress).set(updates).where(eq(courseProgress.id, existing.id));
    } else {
      await db.insert(courseProgress).values({
        courseId, userId: user.id, completedModules: [], percentComplete: 0, lastSeenVersion: 0,
        ...(wizardConfig !== undefined ? { wizardConfig } : {}),
        ...(doneExercises !== undefined ? { doneExercises } : {}),
      });
    }
    return NextResponse.json({ success: true });
  }

  if (typeof markVersionSeen === "number") {
    const [courseRecord] = await db
      .select({
        id: courses.id,
        createdBy: courses.createdBy,
        isPublic: courses.isPublic,
        organizationId: courses.organizationId,
      })
      .from(courses)
      .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)))
      .limit(1);

    if (!courseRecord) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    let hasAccess = courseRecord.createdBy === user.id || courseRecord.isPublic;
    if (!hasAccess && courseRecord.organizationId) {
      const [assignment] = await db
        .select({ id: courseAssignments.id })
        .from(courseAssignments)
        .where(
          and(
            eq(courseAssignments.courseId, courseId),
            eq(courseAssignments.assignedTo, user.id)
          )
        )
        .limit(1);
      if (assignment) hasAccess = true;
    }
    if (!hasAccess) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const [existing] = await db
      .select()
      .from(courseProgress)
      .where(
        and(
          eq(courseProgress.courseId, courseId),
          eq(courseProgress.userId, user.id)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(courseProgress)
        .set({
          lastSeenVersion: markVersionSeen,
          lastViewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(courseProgress.id, existing.id));
    } else {
      await db.insert(courseProgress).values({
        courseId,
        userId: user.id,
        completedModules: [],
        percentComplete: 0,
        lastSeenVersion: markVersionSeen,
        lastViewedAt: new Date(),
      });
    }

    return NextResponse.json({ success: true, lastSeenVersion: markVersionSeen });
  }

  if (typeof moduleIndex !== "number") {
    return NextResponse.json({ error: "moduleIndex is required" }, { status: 400 });
  }

  const [courseRecord] = await db
    .select({
      id: courses.id,
      createdBy: courses.createdBy,
      isPublic: courses.isPublic,
      repoName: courses.repoName,
      ownerName: courses.ownerName,
      organizationId: courses.organizationId,
      skillTags: courses.skillTags,
    })
    .from(courses)
    .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)))
    .limit(1);

  if (!courseRecord) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  let hasAccess = courseRecord.createdBy === user.id || courseRecord.isPublic;

  if (!hasAccess && courseRecord.organizationId) {
    const [assignment] = await db
      .select({ id: courseAssignments.id })
      .from(courseAssignments)
      .where(
        and(
          eq(courseAssignments.courseId, courseId),
          eq(courseAssignments.assignedTo, user.id)
        )
      )
      .limit(1);
    if (assignment) hasAccess = true;
  }

  if (!hasAccess) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const [existing] = await db
    .select()
    .from(courseProgress)
    .where(
      and(
        eq(courseProgress.courseId, courseId),
        eq(courseProgress.userId, user.id)
      )
    )
    .limit(1);

  if (existing) {
    const completedModules = (existing.completedModules || []) as number[];
    const isNewModule = !completedModules.includes(moduleIndex);
    if (isNewModule) {
      completedModules.push(moduleIndex);
    }
    const percentComplete = totalModules
      ? Math.round((completedModules.length / totalModules) * 100)
      : existing.percentComplete;

    await db
      .update(courseProgress)
      .set({
        completedModules,
        percentComplete,
        lastViewedAt: new Date(),
        completedAt: percentComplete >= 100 ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(courseProgress.id, existing.id));

    let leveledUp = false;
    let newLevel = 0;
    let newLevelName = "";
    let newBadges: string[] = [];

    if (isNewModule) {
      try {
        const r = await awardXp(user.id, "module_read", courseId);
        if (r.leveledUp) { leveledUp = true; newLevel = r.newLevel; newLevelName = r.newLevelName; }
        newBadges = [...newBadges, ...r.newBadges];
      } catch {}
    }
    if (percentComplete >= 100 && !existing.completedAt) {
      try {
        const r = await awardXp(user.id, "course_complete", courseId);
        if (r.leveledUp) { leveledUp = true; newLevel = r.newLevel; newLevelName = r.newLevelName; }
        newBadges = [...newBadges, ...r.newBadges];
      } catch {}
      triggerSlackCompletion(courseRecord, user).catch(() => {});
      triggerEmailCompletion(courseRecord, user).catch(() => {});
      recordUserSkills(user.id, courseId, courseRecord.skillTags).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      percentComplete,
      completedModules,
      ...(leveledUp ? { leveledUp, newLevel, newLevelName } : {}),
      ...(newBadges.length > 0 ? { newBadges } : {}),
    });
  }

  const completedModules = [moduleIndex];
  const percentComplete = totalModules ? Math.round((1 / totalModules) * 100) : 0;
  const isCompleted = percentComplete >= 100;

  await db.insert(courseProgress).values({
    courseId,
    userId: user.id,
    completedModules,
    percentComplete,
    lastViewedAt: new Date(),
    completedAt: isCompleted ? new Date() : null,
  });

  let leveledUp2 = false;
  let newLevel2 = 0;
  let newLevelName2 = "";
  let newBadges2: string[] = [];

  try {
    const r = await awardXp(user.id, "module_read", courseId);
    if (r.leveledUp) { leveledUp2 = true; newLevel2 = r.newLevel; newLevelName2 = r.newLevelName; }
    newBadges2 = [...newBadges2, ...r.newBadges];
  } catch {}
  if (isCompleted) {
    try {
      const r = await awardXp(user.id, "course_complete", courseId);
      if (r.leveledUp) { leveledUp2 = true; newLevel2 = r.newLevel; newLevelName2 = r.newLevelName; }
      newBadges2 = [...newBadges2, ...r.newBadges];
    } catch {}
    triggerSlackCompletion(courseRecord, user).catch(() => {});
    triggerEmailCompletion(courseRecord, user).catch(() => {});
    recordUserSkills(user.id, courseId, courseRecord.skillTags).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    percentComplete,
    completedModules,
    ...(leveledUp2 ? { leveledUp: leveledUp2, newLevel: newLevel2, newLevelName: newLevelName2 } : {}),
    ...(newBadges2.length > 0 ? { newBadges: newBadges2 } : {}),
  });
}

async function triggerSlackCompletion(
  courseRecord: { id: string; organizationId: string | null; repoName: string; ownerName: string },
  user: { id: string; displayName: string }
) {
  if (!courseRecord.organizationId) return;

  const [assignment] = await db
    .select()
    .from(courseAssignments)
    .where(
      and(
        eq(courseAssignments.courseId, courseRecord.id),
        eq(courseAssignments.assignedTo, user.id)
      )
    )
    .limit(1);

  if (!assignment) return;

  const [org] = await db
    .select({ slackWebhookUrl: organizations.slackWebhookUrl })
    .from(organizations)
    .where(eq(organizations.id, courseRecord.organizationId))
    .limit(1);

  if (org?.slackWebhookUrl) {
    await sendSlackNotification(
      org.slackWebhookUrl,
      courseCompletedMessage(
        `${courseRecord.ownerName}/${courseRecord.repoName}`,
        user.displayName
      )
    );
  }
}

async function triggerEmailCompletion(
  courseRecord: { id: string; repoName: string; ownerName: string },
  user: { id: string; displayName: string },
) {
  if (!isEmailConfigured()) return;

  const [userRecord] = await db
    .select({ email: users.email, emailNotifications: users.emailNotifications })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!userRecord?.email || !userRecord.emailNotifications) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://codelens.ai";
  const courseName = `${courseRecord.ownerName}/${courseRecord.repoName}`;
  const courseUrl = `${appUrl}/course/${courseRecord.id}`;

  await sendCourseCompletionEmail(
    userRecord.email,
    user.displayName,
    courseName,
    courseUrl,
  );
}

async function recordUserSkills(userId: string, courseId: string, skillTags: string[] | null) {
  if (!skillTags || skillTags.length === 0) return;

  for (const skill of skillTags) {
    const normalizedSkill = skill.toLowerCase().trim();
    if (!normalizedSkill) continue;

    const [existing] = await db
      .select({ id: userSkills.id })
      .from(userSkills)
      .where(
        and(
          eq(userSkills.userId, userId),
          eq(userSkills.skill, normalizedSkill)
        )
      )
      .limit(1);

    if (!existing) {
      await db.insert(userSkills).values({
        userId,
        skill: normalizedSkill,
        acquiredFromCourseId: courseId,
      });
    }
  }
}
