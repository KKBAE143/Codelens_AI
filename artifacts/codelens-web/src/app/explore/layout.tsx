import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explore Courses — CodeLens AI",
  description: "Browse AI-generated interactive courses for open source GitHub repositories. Learn any codebase with CodeLens AI.",
  openGraph: {
    title: "Explore Courses — CodeLens AI",
    description: "Browse AI-generated interactive courses for open source GitHub repositories.",
    type: "website",
  },
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
