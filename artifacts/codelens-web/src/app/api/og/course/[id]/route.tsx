import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { db } from "@workspace/db";
import { courses } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let course;
  try {
    [course] = await db
      .select({
        repoName: courses.repoName,
        ownerName: courses.ownerName,
        oneLiner: courses.oneLiner,
        difficulty: courses.difficulty,
        estimatedMinutes: courses.estimatedMinutes,
        moduleCount: courses.moduleCount,
        techStack: courses.techStack,
        targetAudience: courses.targetAudience,
      })
      .from(courses)
      .where(
        and(
          eq(courses.id, id),
          eq(courses.isPublic, true),
          isNull(courses.deletedAt),
        ),
      )
      .limit(1);
  } catch {
    course = null;
  }

  if (!course) {
    return new ImageResponse(
      (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", backgroundColor: "#FAF9F6", fontFamily: "sans-serif" }}>
          <span style={{ fontSize: 48, color: "#E85D30" }}>◉</span>
          <span style={{ fontSize: 36, fontWeight: 700, marginLeft: 12 }}>CodeLens AI</span>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }

  const languages = course.techStack?.languages?.slice(0, 4) || [];

  return new ImageResponse(
    (
      <div style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: "#FAF9F6",
        padding: "60px 80px",
        fontFamily: "sans-serif",
      }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 32 }}>
          <span style={{ fontSize: 36, color: "#E85D30" }}>◉</span>
          <span style={{ fontSize: 24, fontWeight: 700, marginLeft: 8, color: "#2C2C2A" }}>CodeLens AI</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <img
            src={`https://github.com/${course.ownerName}.png?size=48`}
            width={40}
            height={40}
            style={{ borderRadius: "50%" }}
          />
          <span style={{ fontSize: 22, color: "#6B6B69" }}>
            {course.ownerName} /
          </span>
          <span style={{ fontSize: 28, fontWeight: 700, color: "#2C2C2A" }}>
            {course.repoName}
          </span>
        </div>

        {course.oneLiner && (
          <p style={{ fontSize: 22, color: "#6B6B69", lineHeight: 1.4, marginBottom: 24, maxWidth: 900 }}>
            {course.oneLiner}
          </p>
        )}

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: "auto" }}>
          {course.moduleCount && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#F3F1EA", borderRadius: 8, padding: "8px 16px" }}>
              <span style={{ fontSize: 16, color: "#2C2C2A", fontWeight: 600 }}>{course.moduleCount} modules</span>
            </div>
          )}
          {course.estimatedMinutes && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#F3F1EA", borderRadius: 8, padding: "8px 16px" }}>
              <span style={{ fontSize: 16, color: "#2C2C2A", fontWeight: 600 }}>~{course.estimatedMinutes} min</span>
            </div>
          )}
          {course.difficulty && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#F3F1EA", borderRadius: 8, padding: "8px 16px" }}>
              <span style={{ fontSize: 16, color: "#2C2C2A", fontWeight: 600 }}>{course.difficulty}</span>
            </div>
          )}
          {languages.map((lang) => (
            <div key={lang} style={{ display: "flex", alignItems: "center", gap: 6, background: "#FAECE7", borderRadius: 8, padding: "8px 16px" }}>
              <span style={{ fontSize: 16, color: "#E85D30", fontWeight: 600 }}>{lang}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
