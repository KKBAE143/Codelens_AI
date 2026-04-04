export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import {
  createSession,
  upsertUser,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "@/lib/auth";
import { storeGithubToken } from "@/lib/github-auth";
import { sendWelcomeEmail } from "@/lib/email";

function getOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedProto =
    request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const forwardedHost =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    url.host;
  return `${forwardedProto}://${forwardedHost}`;
}

function getSafeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/";
  }
  return value;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = request.cookies.get("github_oauth_state")?.value;

  const origin = getOrigin(request);

  if (!code || !state || state !== storedState) {
    console.error("[Auth Callback] State mismatch or missing code/state", { hasCode: !!code, hasState: !!state, stateMatch: state === storedState });
    const errResponse = NextResponse.redirect(new URL("/?error=auth_state_mismatch", origin));
    errResponse.cookies.delete("github_oauth_state");
    errResponse.cookies.delete("return_to");
    return errResponse;
  }

  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    return NextResponse.json(
      {
        error:
          "GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
      },
      { status: 500 },
    );
  }

  const ghHeaders = {
    "User-Agent": "CodeLens-Web/1.0",
    Accept: "application/vnd.github.v3+json",
  };

  try {
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "CodeLens-Web/1.0",
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${origin}/api/auth/callback`,
        }),
      },
    );

    const tokenData = await tokenResponse.json();
    console.log("[Auth Callback] Token exchange status:", tokenResponse.status, "hasToken:", !!tokenData.access_token, "error:", tokenData.error || "none");

    if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
      console.error("[Auth Callback] Token exchange failed:", tokenResponse.status, tokenData.error || "no access_token");
      return NextResponse.redirect(new URL("/?error=auth_token_failed", origin));
    }

    let userResponse = await fetch("https://api.github.com/user", {
      headers: {
        ...ghHeaders,
        Authorization: `token ${tokenData.access_token}`,
      },
    });

    if (userResponse.status === 403 || userResponse.status === 429) {
      const retryBody = await userResponse.text().catch(() => "");
      console.warn("[Auth Callback] GitHub /user returned", userResponse.status, "- retrying in 2s. Body:", retryBody);
      await new Promise((r) => setTimeout(r, 2000));
      userResponse = await fetch("https://api.github.com/user", {
        headers: {
          ...ghHeaders,
          Authorization: `token ${tokenData.access_token}`,
        },
      });
    }

    if (!userResponse.ok) {
      const errorBody = await userResponse.text().catch(() => "");
      console.error("[Auth Callback] GitHub user fetch failed:", userResponse.status, errorBody);
      return NextResponse.redirect(new URL("/?error=auth_user_failed", origin));
    }

    const githubUser = await userResponse.json();
    if (!githubUser.id || !githubUser.login) {
      console.error("[Auth Callback] Invalid GitHub user data");
      return NextResponse.redirect(new URL("/?error=auth_invalid_user", origin));
    }

    const { user: dbUser, isNew: isNewUser } = await upsertUser({
      id: githubUser.id,
      login: githubUser.login,
      name: githubUser.name,
      email: githubUser.email,
      avatar_url: githubUser.avatar_url,
    });

    await storeGithubToken(dbUser.id, tokenData.access_token, githubUser.login);

    const sessionData: SessionData = {
      user: dbUser,
    };

    const sid = await createSession(sessionData);

    const returnTo = getSafeReturnTo(request.cookies.get("return_to")?.value);
    const response = NextResponse.redirect(new URL(returnTo, origin));

    response.cookies.set(SESSION_COOKIE, sid, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_TTL / 1000),
    });

    response.cookies.delete("github_oauth_state");
    response.cookies.delete("return_to");

    if (isNewUser && dbUser.email) {
      try {
        await sendWelcomeEmail(dbUser.email, dbUser.displayName);
      } catch (err) {
        console.warn("[Email] Welcome email failed:", err);
      }
    }

    return response;
  } catch (err) {
    console.error("[Auth Callback] Authentication failed:", err);
    const response = NextResponse.redirect(
      new URL("/?error=auth_failed", origin),
    );
    response.cookies.delete("github_oauth_state");
    response.cookies.delete("return_to");
    return response;
  }
}
