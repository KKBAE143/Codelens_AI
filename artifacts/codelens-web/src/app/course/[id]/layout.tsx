import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Course Viewer — CodeLens AI",
  description: "Interactive AI-generated course viewer",
};

export default function CourseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
