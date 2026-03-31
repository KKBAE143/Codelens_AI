export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { after, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getUserGithubToken } from "@/lib/github-auth";
import { checkAndIncrementUsage } from "@/lib/rate-limit";
import { parseGithubUrl } from "@/lib/github";
import { inngest, isInngestConfigured } from "@/lib/inngest";
import { generateCourseDirect } from "@/lib/jobs/generate-course-direct";
import { db } from "@workspace/db";
import {
  courses,
  organizations,
  organizationMembers,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { sendSlackNotification, courseGeneratedMessage } from "@/lib/slack";

export async function POST(request: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    githubUrl,
    targetAudience,
    organizationSlug,
    depth,
    focusAreas,
    customContext,
  } = body;

  if (!githubUrl || typeof githubUrl !== "string") {
    return NextResponse.json(
      { error: "githubUrl is required" },
      { status: 400 },
    );
  }

  const validAudiences = [
    "vibe_coder",
    "new_engineer",
    "product_manager",
    "security_auditor",
  ];
  const audience = validAudiences.includes(targetAudience)
    ? targetAudience
    : "new_engineer";

  let parsed;
  try {
    parsed = parseGithubUrl(githubUrl);
  } catch (error) {
    console.error(
      "GitHub URL parse error:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { error: "Invalid GitHub URL. Please provide a valid repository URL." },
      { status: 400 },
    );
  }

  const rateLimit = await checkAndIncrementUsage(user.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "Monthly generation limit reached. Upgrade to Pro for unlimited generations.",
        remaining: rateLimit.remaining,
        resetAt: rateLimit.resetAt.toISOString(),
      },
      { status: 429 },
    );
  }

  let organizationId: string | null = null;
  if (organizationSlug && typeof organizationSlug === "string") {
    if (user.plan !== "team") {
      return NextResponse.json(
        { error: "Team plan required to generate courses for an organization" },
        { status: 403 },
      );
    }

    const [org] = await db
      .select({
        id: organizations.id,
        slackWebhookUrl: organizations.slackWebhookUrl,
      })
      .from(organizations)
      .where(eq(organizations.slug, organizationSlug))
      .limit(1);

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, org.id),
          eq(organizationMembers.userId, user.id),
          eq(organizationMembers.status, "active"),
        ),
      )
      .limit(1);

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this organization" },
        { status: 403 },
      );
    }

    organizationId = org.id;
  }

  let stars: number | null = null;
  let repoIsPrivate = true;
  let githubHeaders: Record<string, string> | undefined;

  try {
    const token = await getUserGithubToken(user.id);
    githubHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  } catch {}

  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
      githubHeaders ? { headers: githubHeaders } : undefined,
    );
    if (ghRes.ok) {
      const ghData = await ghRes.json();
      stars =
        typeof ghData.stargazers_count === "number"
          ? ghData.stargazers_count
          : null;
      repoIsPrivate = ghData.private === true;
    }
  } catch {}

  const [course] = await db
    .insert(courses)
    .values({
      githubUrl: githubUrl.trim(),
      repoName: parsed.repo,
      ownerName: parsed.owner,
      defaultBranch: parsed.branch || "main",
      targetAudience: audience,
      depthPreset: ["quick", "full", "deep"].includes(depth) ? depth : "full",
      focusAreas: Array.isArray(focusAreas) ? focusAreas : [],
      customContext:
        typeof customContext === "string" ? customContext.slice(0, 2000) : null,
      status: "pending",
      createdBy: user.id,
      organizationId,
      stars,
      isPrivate: repoIsPrivate,
      isPublic: !repoIsPrivate,
    })
    .returning();

  if (isInngestConfigured()) {
    await inngest.send({
      name: "codelens/course.generate",
      data: { courseId: course.id },
    });
  } else {
    after(async () => {
      try {
        await generateCourseDirect(course.id);
      } catch (err) {
        console.error("Direct course generation failed:", err);
      }
    });
  }

  if (organizationId) {
    const [org] = await db
      .select({ slackWebhookUrl: organizations.slackWebhookUrl })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (org?.slackWebhookUrl) {
      sendSlackNotification(
        org.slackWebhookUrl,
        courseGeneratedMessage(
          `${parsed.owner}/${parsed.repo}`,
          audience,
          user.displayName,
        ),
      ).catch(() => {});
    }
  }

  return NextResponse.json({
    courseId: course.id,
    message: "Generation started",
  });
}
