import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getUserGithubToken } from "@/lib/github-auth";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let token: string;
  try {
    token = await getUserGithubToken(user.id);
  } catch {
    return NextResponse.json({ error: "GitHub token not found. Please sign in again." }, { status: 401 });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    const ghRes = await fetch("https://api.github.com/user/orgs?per_page=100", { headers });
    if (!ghRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch organizations from GitHub" },
        { status: ghRes.status >= 500 ? 502 : ghRes.status }
      );
    }

    const raw = await ghRes.json();
    const orgs = (raw || []).map((o: Record<string, unknown>) => ({
      login: o.login,
      avatar_url: o.avatar_url,
      description: o.description,
    }));

    return NextResponse.json({
      user: {
        login: user.githubUsername || user.username,
        avatar_url: user.avatarUrl,
      },
      orgs,
    });
  } catch (err) {
    console.error("GitHub orgs fetch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
