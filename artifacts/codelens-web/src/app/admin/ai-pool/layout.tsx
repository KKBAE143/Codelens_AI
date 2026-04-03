import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";

export default async function AdminAiPoolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hasAccess = await isAdmin();

  if (!hasAccess) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
