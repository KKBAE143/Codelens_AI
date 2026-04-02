import crypto from "crypto";
import { db } from "@workspace/db";
import { users, sessionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "sid";
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  plan: "free" | "pro" | "team";
  githubUsername: string | null;
  githubConnectedAt: Date | null;
  monthlyGenerationsUsed: number;
}

export interface SessionData {
  user: AuthUser;
}

export async function createSession(data: SessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  });
  return sid;
}

export async function getSession(sid: string): Promise<SessionData | null> {
  const [row] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.sid, sid));

  if (!row || row.expire < new Date()) {
    if (row) await deleteSession(sid);
    return null;
  }

  return row.sess as unknown as SessionData;
}

export async function deleteSession(sid: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
}

export async function upsertUser(githubProfile: {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}): Promise<{ user: AuthUser; isNew: boolean }> {
  const userData = {
    id: String(githubProfile.id),
    username: githubProfile.login,
    displayName: githubProfile.name || githubProfile.login,
    email: githubProfile.email,
    avatarUrl: githubProfile.avatar_url,
  };

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.id, userData.id))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        username: userData.username,
        displayName: userData.displayName,
        email: userData.email,
        avatarUrl: userData.avatarUrl,
        githubUsername: githubProfile.login,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userData.id));

    return {
      user: {
        id: existing.id,
        username: userData.username,
        displayName: userData.displayName,
        email: userData.email,
        avatarUrl: userData.avatarUrl,
        plan: existing.plan as "free" | "pro" | "team",
        githubUsername: githubProfile.login,
        githubConnectedAt: existing.githubConnectedAt ?? new Date(),
        monthlyGenerationsUsed: existing.monthlyGenerationsUsed,
      },
      isNew: false,
    };
  }

  const [newUser] = await db
    .insert(users)
    .values({
      ...userData,
      githubUsername: githubProfile.login,
      githubConnectedAt: new Date(),
    })
    .returning();

  return {
    user: {
      id: newUser.id,
      username: newUser.username,
      displayName: newUser.displayName,
      email: newUser.email,
      avatarUrl: newUser.avatarUrl,
      plan: newUser.plan as "free" | "pro" | "team",
      githubUsername: newUser.githubUsername,
      githubConnectedAt: newUser.githubConnectedAt,
      monthlyGenerationsUsed: newUser.monthlyGenerationsUsed,
    },
    isNew: true,
  };
}

export async function getUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const sid = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sid) return null;

  const session = await getSession(sid);
  if (!session) return null;

  return session.user;
}

export async function requireAuth(): Promise<AuthUser> {
  const user = await getUser();
  if (!user) {
    throw new Error("Authentication required");
  }
  return user;
}
