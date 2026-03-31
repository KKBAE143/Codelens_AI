import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — CodeLens AI",
  description: "Manage your AI-generated interactive courses",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
