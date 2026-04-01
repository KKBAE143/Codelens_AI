import type { Metadata } from "next";
import { db } from "@workspace/db";
import { courses } from "@workspace/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";

interface Props {
  params: Promise<{ owner: string; repo: string }>;
  children: React.ReactNode;
}

interface CourseForMeta {
  id: string;
  repoName: string;
  ownerName: string;
  oneLiner: string | null;
  difficulty: string | null;
  estimatedMinutes: number | null;
  moduleCount: number | null;
  techStack: { languages: string[]; frameworks: string[] } | null;
}

async function fetchCourseForMeta(owner: string, repo: string): Promise<CourseForMeta | null> {
  const [course] = await db
    .select({
      id: courses.id,
      repoName: courses.repoName,
      ownerName: courses.ownerName,
      oneLiner: courses.oneLiner,
      difficulty: courses.difficulty,
      estimatedMinutes: courses.estimatedMinutes,
      moduleCount: courses.moduleCount,
      techStack: courses.techStack,
    })
    .from(courses)
    .where(
      and(
        sql`LOWER(${courses.ownerName}) = ${owner.toLowerCase()}`,
        sql`LOWER(${courses.repoName}) = ${repo.toLowerCase()}`,
        eq(courses.status, "completed"),
        eq(courses.isPublic, true),
        eq(courses.isPrivate, false),
        isNull(courses.deletedAt),
      ),
    )
    .limit(1);
  return course || null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, repo } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://codelens.ai";
  const course = await fetchCourseForMeta(owner, repo);

  if (!course) {
    return {
      title: `${owner}/${repo} — CodeLens AI`,
      description: `Course not found for ${owner}/${repo}.`,
    };
  }

  const title = `${course.ownerName}/${course.repoName} — CodeLens AI`;
  const description = course.oneLiner || `AI-generated interactive course for ${course.ownerName}/${course.repoName}. ${course.moduleCount ? `${course.moduleCount} modules` : ""} ${course.estimatedMinutes ? `· ~${course.estimatedMinutes} min` : ""}`.trim();
  const ogImageUrl = `${baseUrl}/api/og/course/${course.id}`;
  const canonicalUrl = `${baseUrl}/explore/${course.ownerName}/${course.repoName}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: "website",
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

function buildJsonLd(course: CourseForMeta, baseUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": ["Course", "LearningResource"],
    name: `${course.ownerName}/${course.repoName}`,
    description: course.oneLiner || `AI-generated course for ${course.ownerName}/${course.repoName}`,
    url: `${baseUrl}/explore/${course.ownerName}/${course.repoName}`,
    provider: { "@type": "Organization", name: "CodeLens AI", url: baseUrl },
    learningResourceType: "interactive course",
    inLanguage: "en",
    isAccessibleForFree: true,
    ...(course.estimatedMinutes && { timeRequired: `PT${course.estimatedMinutes}M` }),
    ...(course.difficulty && { educationalLevel: course.difficulty }),
    ...(course.moduleCount && { numberOfCredits: course.moduleCount }),
    ...(course.techStack?.languages?.length && {
      teaches: course.techStack.languages.join(", "),
    }),
    sourceOrganization: {
      "@type": "Organization",
      name: course.ownerName,
      url: `https://github.com/${course.ownerName}`,
    },
  };
}

export default async function CourseLayout({ params, children }: Props) {
  const { owner, repo } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://codelens.ai";
  const course = await fetchCourseForMeta(owner, repo);

  return (
    <>
      {course && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(course, baseUrl)).replace(/</g, "\\u003c") }}
        />
      )}
      {children}
    </>
  );
}
