import type { MetadataRoute } from "next";
import { db } from "@workspace/db";
import { courses } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://codelens.ai";

  const publicCourses = await db
    .select({
      ownerName: courses.ownerName,
      repoName: courses.repoName,
      updatedAt: courses.updatedAt,
    })
    .from(courses)
    .where(
      and(
        eq(courses.status, "completed"),
        eq(courses.isPublic, true),
        eq(courses.isPrivate, false),
        isNull(courses.deletedAt),
      ),
    );

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/explore`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${baseUrl}/pricing`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
  ];

  const coursePages: MetadataRoute.Sitemap = publicCourses.map((c) => ({
    url: `${baseUrl}/explore/${c.ownerName}/${c.repoName}`,
    lastModified: c.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...coursePages];
}
