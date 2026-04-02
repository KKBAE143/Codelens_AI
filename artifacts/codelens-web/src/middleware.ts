import { NextResponse, type NextRequest } from "next/server";
import { ensureCsrf } from "./lib/csrf";
import { checkRateLimit } from "./lib/rate-limit-redis";

const WINDOW_MS = 60 * 1000;

function getRouteGroup(pathname: string): { key: string; limit: number } | null {
  if (pathname === "/api/health" || pathname === "/api/inngest") return null;
  if (pathname.startsWith("/api/stripe/webhook") || pathname.startsWith("/api/webhooks/")) return null;

  if (pathname.startsWith("/api/auth/")) return { key: "auth", limit: 20 };
  if (pathname === "/api/courses/generate" || pathname.match(/\/api\/courses\/[^/]+\/regenerate$/)) {
    return { key: "generate", limit: 10 };
  }
  if (pathname.startsWith("/api/stripe/")) return { key: "stripe", limit: 15 };
  if (pathname.startsWith("/api/org/")) return { key: "org", limit: 30 };

  return { key: "api", limit: 120 };
}

function getIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api/")) return NextResponse.next();

  const routeGroup = getRouteGroup(pathname);
  if (!routeGroup) return NextResponse.next();

  const ip = getIp(request);
  const bucketKey = `${ip}:${routeGroup.key}`;
  const now = Date.now();

  const result = await checkRateLimit(bucketKey, routeGroup.limit, WINDOW_MS);

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(routeGroup.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
        },
      }
    );
  }

  const csrfError = ensureCsrf(request);
  if (csrfError) return csrfError;

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
