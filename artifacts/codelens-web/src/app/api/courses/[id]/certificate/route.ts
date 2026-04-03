export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { courses, courseProgress, users } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

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

  const { id } = await params;

  const [course] = await db
    .select({
      id: courses.id,
      repoName: courses.repoName,
      ownerName: courses.ownerName,
      oneLiner: courses.oneLiner,
      estimatedMinutes: courses.estimatedMinutes,
      moduleCount: courses.moduleCount,
      difficulty: courses.difficulty,
      skillTags: courses.skillTags,
    })
    .from(courses)
    .where(eq(courses.id, id));

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const [progress] = await db
    .select()
    .from(courseProgress)
    .where(and(eq(courseProgress.courseId, id), eq(courseProgress.userId, user.id)));

  if (!progress || progress.percentComplete < 100) {
    return NextResponse.json({ error: "Course not completed yet" }, { status: 403 });
  }

  const completionDate = progress.completedAt || progress.updatedAt || new Date();
  const formattedDate = completionDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const skills = (course.skillTags || []).slice(0, 6).join(" · ");
  const hours = course.estimatedMinutes ? Math.round(course.estimatedMinutes / 60) : null;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 800px; height: 565px;
    font-family: 'Inter', sans-serif;
    background: linear-gradient(135deg, #0a0a12 0%, #13132b 100%);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
  }
  .cert {
    width: 100%; height: 100%;
    border: 2px solid rgba(99, 102, 241, 0.4);
    border-radius: 16px;
    padding: 40px 48px;
    display: flex; flex-direction: column;
    justify-content: space-between;
    position: relative;
    background: rgba(255,255,255,0.02);
  }
  .cert::before {
    content: '';
    position: absolute; inset: 8px;
    border: 1px solid rgba(99, 102, 241, 0.15);
    border-radius: 12px;
    pointer-events: none;
  }
  .logo { font-size: 18px; font-weight: 700; letter-spacing: -0.5px; color: #818CF8; }
  .title { font-family: 'Playfair Display', serif; font-size: 28px; margin: 12px 0 4px; }
  .subtitle { color: #a5b4fc; font-size: 13px; font-weight: 500; }
  .recipient { font-size: 24px; font-weight: 700; color: #c7d2fe; margin-top: 16px; }
  .course-name { font-size: 15px; color: #94a3b8; margin-top: 4px; }
  .skills { font-size: 11px; color: #6366f1; margin-top: 8px; letter-spacing: 0.5px; }
  .footer { display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px; color: #64748b; }
  .footer .date { font-weight: 500; }
  .footer .meta { text-align: right; }
</style>
</head>
<body>
<div class="cert">
  <div>
    <div class="logo">CodeLens AI</div>
    <div class="title">Certificate of Completion</div>
    <div class="subtitle">This certifies that</div>
    <div class="recipient">${escapeHtml(user.displayName)}</div>
    <div class="course-name">has completed the course on <strong>${escapeHtml(course.ownerName)}/${escapeHtml(course.repoName)}</strong></div>
    ${skills ? `<div class="skills">${escapeHtml(skills)}</div>` : ""}
  </div>
  <div class="footer">
    <div class="date">${formattedDate}</div>
    <div class="meta">
      ${course.moduleCount ? `${course.moduleCount} modules` : ""}
      ${hours ? ` · ~${hours}h` : ""}
      ${course.difficulty ? ` · ${course.difficulty}` : ""}
    </div>
  </div>
</div>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
