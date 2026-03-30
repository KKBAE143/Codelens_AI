import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getUserGithubToken } from "@/lib/github-auth";

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const org = searchParams.get("org") || "";
  const rawPage = parseInt(searchParams.get("page") || "1", 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.min(rawPage, 100) : 1;
  const search = (searchParams.get("search") || "").trim().slice(0, 128);
  const perPage = 30;

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
    let url: string;
    if (search) {
      const qualifier = org ? `org:${org}` : `user:${user.githubUsername}`;
      url = `https://api.github.com/search/repositories?q=${encodeURIComponent(search)}+${qualifier}&sort=updated&order=desc&per_page=${perPage}&page=${page}`;
    } else if (org) {
      url = `https://api.github.com/orgs/${encodeURIComponent(org)}/repos?sort=updated&direction=desc&per_page=${perPage}&page=${page}&type=all`;
    } else {
      url = `https://api.github.com/user/repos?sort=updated&direction=desc&per_page=${perPage}&page=${page}&affiliation=owner`;
    }

    const ghRes = await fetch(url, { headers });
    if (!ghRes.ok) {
      const errBody = await ghRes.text();
      console.error("GitHub API error:", ghRes.status, errBody);
      return NextResponse.json(
        { error: "Failed to fetch repositories from GitHub" },
        { status: ghRes.status >= 500 ? 502 : ghRes.status }
      );
    }

    const raw = await ghRes.json();
    const items = search ? raw.items : raw;

    const repos = (items || []).map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      html_url: r.html_url,
      description: r.description,
      private: r.private,
      language: r.language,
      stargazers_count: r.stargazers_count,
      updated_at: r.updated_at,
      owner: {
        login: (r.owner as Record<string, unknown>)?.login,
        avatar_url: (r.owner as Record<string, unknown>)?.avatar_url,
      },
    }));

    const linkHeader = ghRes.headers.get("Link") || "";
    const hasNext = linkHeader.includes('rel="next"');
    const totalCount = search ? raw.total_count : undefined;

    return NextResponse.json({ repos, page, perPage, hasNext, totalCount });
  } catch (err) {
    console.error("GitHub repos fetch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
