import type { Metadata } from "next";
import { db } from "@workspace/db";
import { courses } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";

type Props = {
  params: Promise<{ token: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;

  const [course] = await db
    .select({
      repoName: courses.repoName,
      ownerName: courses.ownerName,
      oneLiner: courses.oneLiner,
    })
    .from(courses)
    .where(
      and(
        eq(courses.shareToken, token),
        eq(courses.isPublic, true),
        eq(courses.status, "completed"),
        isNull(courses.deletedAt)
      )
    )
    .limit(1);

  if (!course) {
    return {
      title: "Course Not Found — CodeLens AI",
    };
  }

  const title = `Learn how ${course.ownerName}/${course.repoName} works — CodeLens AI`;
  const description = course.oneLiner || `AI-generated interactive course for ${course.ownerName}/${course.repoName}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
