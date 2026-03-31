import { NextResponse, type NextRequest } from "next/server";

const WINDOW_MS = 60 * 1000;

interface BucketEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, BucketEntry>();

let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api/")) return NextResponse.next();

  const routeGroup = getRouteGroup(pathname);
  if (!routeGroup) return NextResponse.next();

  cleanup();

  const ip = getIp(request);
  const bucketKey = `${ip}:${routeGroup.key}`;
  const now = Date.now();
  const entry = buckets.get(bucketKey);

  if (!entry || entry.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + WINDOW_MS });
    return NextResponse.next();
  }

  entry.count++;

  if (entry.count > routeGroup.limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(routeGroup.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
        },
      }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
