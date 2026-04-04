import { NextResponse, type NextRequest } from "next/server";

const WINDOW_MS = 60 * 1000;

const inMemoryBuckets = new Map<string, { count: number; resetAt: number }>();
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of inMemoryBuckets) {
    if (entry.resetAt <= now) inMemoryBuckets.delete(key);
  }
}

function checkRateLimitInline(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  cleanup();
  const now = Date.now();
  const entry = inMemoryBuckets.get(key);

  if (!entry || entry.resetAt <= now) {
    inMemoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  entry.count++;
  const remaining = Math.max(0, limit - entry.count);
  const allowed = entry.count <= limit;

  return { allowed, remaining, resetAt: entry.resetAt };
}

function getRouteGroup(pathname: string): { key: string; limit: number } | null {
  if (pathname === "/api/health" || pathname === "/api/inngest") return null;
  if (pathname.startsWith("/api/stripe/webhook") || pathname.startsWith("/api/webhooks/")) return null;
  if (pathname.startsWith("/api/auth/")) return null;
  if (pathname === "/api/csrf-token") return null;
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

  const result = checkRateLimitInline(bucketKey, routeGroup.limit, WINDOW_MS);

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

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
