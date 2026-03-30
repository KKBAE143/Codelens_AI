import { NextResponse } from "next/server";
import { db } from "@workspace/db";
import { courses } from "@workspace/db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";

const DEMO_REPOS = [
  { owner: "vercel", repo: "next.js" },
  { owner: "excalidraw", repo: "excalidraw" },
  { owner: "calcom", repo: "cal.com" },
];

export async function GET() {
  try {
    const results = await db
      .select({
        ownerName: courses.ownerName,
        repoName: courses.repoName,
        shareToken: courses.shareToken,
      })
      .from(courses)
      .where(
        and(
          eq(courses.isPublic, true),
          eq(courses.status, "completed"),
          isNull(courses.deletedAt),
          inArray(
            courses.repoName,
            DEMO_REPOS.map((r) => r.repo)
          )
        )
      )
      .limit(10);

    const demos = results
      .filter((r) => r.shareToken && DEMO_REPOS.some((d) => d.owner === r.ownerName && d.repo === r.repoName))
      .map((r) => ({
        repo: `${r.ownerName}/${r.repoName}`,
        shareToken: r.shareToken,
      }));

    return NextResponse.json({ demos });
  } catch {
    return NextResponse.json({ demos: [] });
  }
}
