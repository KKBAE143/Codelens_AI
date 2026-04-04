export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getUserGithubToken } from "@/lib/github-auth";
import { checkAndIncrementUsage } from "@/lib/rate-limit";
import { parseGithubUrl } from "@/lib/github";
import { inngest, isInngestConfigured } from "@/lib/inngest";
import { generateCourseDirect } from "@/lib/jobs/generate-course-direct";
import { unauthorized, badRequest, forbidden, notFound, apiJsonError } from "@/lib/api-errors";
import { db } from "@workspace/db";
import {
  courses,
  organizations,
  organizationMembers,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { sendSlackNotification, courseGeneratedMessage } from "@/lib/slack";

const generateCourseSchema = z.object({
  githubUrl: z.string().url("githubUrl must be a valid URL"),
  targetAudience: z.enum(["vibe_coder", "new_engineer", "product_manager", "security_auditor"]).optional(),
  organizationSlug: z.string().optional(),
  depth: z.enum(["quick", "full", "deep"]).optional(),
  focusAreas: z.array(z.string()).optional(),
  customContext: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return unauthorized("Authentication required");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = generateCourseSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", "));
  }

  const {
    githubUrl,
    targetAudience,
    organizationSlug,
    depth,
    focusAreas,
    customContext,
  } = parsed.data;

  const audience = targetAudience || "new_engineer";

  let parsedUrl;
  try {
    parsedUrl = parseGithubUrl(githubUrl);
  } catch (error) {
    console.error(
      "GitHub URL parse error:",
      error instanceof Error ? error.message : error,
    );
    return badRequest("Invalid GitHub URL. Please provide a valid repository URL.");
  }

  const rateLimit = await checkAndIncrementUsage(user.id);
  if (!rateLimit.allowed) {
    return apiJsonError(
      "Monthly generation limit reached. Upgrade to Pro for unlimited generations.",
      429,
      { remaining: rateLimit.remaining, resetAt: rateLimit.resetAt.toISOString() },
    );
  }

  let organizationId: string | null = null;
  if (organizationSlug && typeof organizationSlug === "string") {
    if (user.plan !== "team") {
      return forbidden("Team plan required to generate courses for an organization");
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
      return notFound("Organization not found");
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
      return forbidden("Not a member of this organization");
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
      `https://api.github.com/repos/${parsedUrl.owner}/${parsedUrl.repo}`,
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
      repoName: parsedUrl.repo,
      ownerName: parsedUrl.owner,
      defaultBranch: parsedUrl.branch || "main",
      targetAudience: audience,
      depthPreset: depth || "full",
      focusAreas: focusAreas || [],
      customContext: customContext || null,
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
        try {
          await db
            .update(courses)
            .set({
              status: "failed",
              errorMessage: err instanceof Error ? err.message : "Generation failed unexpectedly",
              updatedAt: new Date(),
            })
            .where(eq(courses.id, course.id));
        } catch (dbErr) {
          console.error("Failed to update course status after error:", dbErr);
        }
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
          `${parsedUrl.owner}/${parsedUrl.repo}`,
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
