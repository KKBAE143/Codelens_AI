import { getUser } from "./auth";

export async function requireAdmin(): Promise<{ id: string; username: string }> {
  const user = await getUser();
  if (!user) {
    throw new Error("Authentication required");
  }

  const adminIds = process.env.ADMIN_USER_IDS?.split(",").map(s => s.trim()).filter(Boolean) || [];

  if (adminIds.length === 0) {
    throw new Error("Admin access not configured. Set ADMIN_USER_IDS environment variable.");
  }

  if (adminIds.includes(user.id) || adminIds.includes(user.username)) {
    return { id: user.id, username: user.username };
  }

  throw new Error("Admin access required");
}

export async function isAdmin(): Promise<boolean> {
  try {
    await requireAdmin();
    return true;
  } catch {
    return false;
  }
}
