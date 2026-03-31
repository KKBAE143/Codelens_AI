export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { requireOrgMembership } from "@/lib/org-helpers";
import { db } from "@workspace/db";
import { organizations, organizationMembers, courseAssignments, courses } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { sendSlackNotification } from "@/lib/slack";

export async function PATCH(
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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ALLOWED_FIELDS = new Set(["name", "slackWebhookUrl"]);
  const receivedFields = Object.keys(body);
  const unknownFields = receivedFields.filter(f => !ALLOWED_FIELDS.has(f));
  if (unknownFields.length > 0) {
    return NextResponse.json(
      { error: "Unknown fields are not allowed" },
      { status: 400 }
    );
  }

  const updates: { name?: string; slackWebhookUrl?: string | null; updatedAt: Date } = { updatedAt: new Date() };

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.length < 2 || body.name.length > 100) {
      return NextResponse.json({ error: "Name must be 2-100 characters" }, { status: 400 });
    }
    updates.name = body.name;
  }

  if (body.slackWebhookUrl !== undefined) {
    if (
      body.slackWebhookUrl === null ||
      body.slackWebhookUrl === ""
    ) {
      updates.slackWebhookUrl = null;
    } else if (
      typeof body.slackWebhookUrl === "string" &&
      body.slackWebhookUrl.startsWith("https://hooks.slack.com/")
    ) {
      updates.slackWebhookUrl = body.slackWebhookUrl;
    } else {
      return NextResponse.json(
        { error: "Invalid Slack webhook URL" },
        { status: 400 }
      );
    }
  }

  await db.update(organizations).set(updates).where(eq(organizations.id, org.id));

  return NextResponse.json({ success: true });
}

export async function POST(
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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "test_webhook") {
    if (!org.slackWebhookUrl) {
      return NextResponse.json({ error: "No Slack webhook URL configured" }, { status: 400 });
    }

    const success = await sendSlackNotification(org.slackWebhookUrl, {
      type: "course_generated",
      text: "Test notification from CodeLens AI",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: ":white_check_mark: *CodeLens AI* — Slack integration is working! Notifications for course generation, assignments, and completions will appear here.",
          },
        },
      ],
    });

    if (!success) {
      return NextResponse.json({ error: "Failed to send test notification. Check your webhook URL." }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { slug } = await params;
  const result = await requireOrgMembership(slug, user.id, "owner");
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { org } = result;

  await db.update(courses).set({ organizationId: null }).where(eq(courses.organizationId, org.id));
  await db.delete(courseAssignments).where(eq(courseAssignments.organizationId, org.id));
  await db.delete(organizationMembers).where(eq(organizationMembers.organizationId, org.id));
  await db.delete(organizations).where(eq(organizations.id, org.id));

  return NextResponse.json({ success: true });
}
