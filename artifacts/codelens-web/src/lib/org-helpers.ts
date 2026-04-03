import { db } from "@workspace/db";
import { organizations, organizationMembers } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

export type OrgRole = "owner" | "admin" | "member";

export async function getOrgBySlug(slug: string) {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  return org || null;
}

export async function getMembership(orgId: string, userId: string) {
  const [membership] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.userId, userId)
      )
    )
    .limit(1);
  return membership || null;
}

export async function requireOrgMembership(
  slug: string,
  userId: string,
  minRole?: OrgRole
) {
  const org = await getOrgBySlug(slug);
  if (!org) return { error: "Organization not found", status: 404 } as const;

  const membership = await getMembership(org.id, userId);
  if (!membership || membership.status !== "active") {
    return { error: "Not a member of this organization", status: 403 } as const;
  }

  if (minRole) {
    const roleHierarchy: Record<string, number> = {
      owner: 3,
      admin: 2,
      member: 1,
    };
    if ((roleHierarchy[membership.role] || 0) < (roleHierarchy[minRole] || 0)) {
      return { error: "Insufficient permissions", status: 403 } as const;
    }
  }

  return { org, membership } as const;
}
