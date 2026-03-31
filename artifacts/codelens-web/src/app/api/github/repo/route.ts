export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getUserGithubToken } from "@/lib/github-auth";

function normalizeRepoInput(
  value: string | null,
): { owner: string; repo: string } | null {
  if (!value) return null;

  const trimmed = value.trim();
  const urlMatch = trimmed.match(/github\.com\/([^/]+)\/([^/\s?#]+)/i);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/, "") };
  }

  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length === 2) {
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, "") };
  }

  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = normalizeRepoInput(
    searchParams.get("url") || searchParams.get("repo"),
  );

  if (!parsed) {
    return NextResponse.json(
      { error: "A valid GitHub repository URL or owner/repo is required" },
      { status: 400 },
    );
  }

  let token: string | undefined;
  const user = await getUser();
  if (user) {
    try {
      token = await getUserGithubToken(user.id);
    } catch {}
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "CodeLens-AI",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
      {
        headers,
        cache: "no-store",
      },
    );

    if (ghRes.status === 404) {
      return NextResponse.json(
        {
          error:
            "Repository not found. If it is private, reconnect GitHub and try again.",
        },
        { status: 404 },
      );
    }

    if (ghRes.status === 401 || ghRes.status === 403) {
      return NextResponse.json(
        {
          error:
            "Repository is not accessible with the current GitHub connection.",
        },
        { status: ghRes.status },
      );
    }

    if (!ghRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch repository from GitHub" },
        { status: 502 },
      );
    }

    const data = await ghRes.json();
    return NextResponse.json({
      name: data.name,
      full_name: data.full_name,
      description: data.description,
      stargazers_count: data.stargazers_count,
      language: data.language,
      pushed_at: data.pushed_at,
      private: data.private,
      owner: {
        login: data.owner?.login,
        avatar_url: data.owner?.avatar_url,
      },
    });
  } catch (error) {
    console.error("GitHub repo preview fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
