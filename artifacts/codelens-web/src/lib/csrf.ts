import { NextResponse, type NextRequest } from "next/server";

export const CSRF_COOKIE_NAME = "csrf-token";
export const CSRF_HEADER_NAME = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const SKIP_PATHS = [
  "/api/webhooks/",
  "/api/stripe/webhook",
  "/api/inngest",
  "/api/health",
  "/api/csrf-token",
];

export function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function verifyCsrfToken(
  token: string,
  cookieToken: string | undefined
): boolean {
  if (!token || !cookieToken) return false;
  if (token.length !== cookieToken.length) return false;
  const encoder = new TextEncoder();
  const a = encoder.encode(token);
  const b = encoder.encode(cookieToken);
  if (a.byteLength !== b.byteLength) return false;
  let mismatch = 0;
  for (let i = 0; i < a.byteLength; i++) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
}

function shouldSkipCsrf(pathname: string): boolean {
  return SKIP_PATHS.some((path) => pathname.startsWith(path));
}

export function ensureCsrf(
  request: NextRequest
): NextResponse | null {
  if (SAFE_METHODS.has(request.method)) return null;
  if (shouldSkipCsrf(request.nextUrl.pathname)) return null;

  const headerToken = request.headers.get(CSRF_HEADER_NAME) ?? undefined;
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;

  if (!verifyCsrfToken(headerToken ?? "", cookieToken)) {
    return NextResponse.json(
      { error: "CSRF token invalid or missing" },
      { status: 403 }
    );
  }

  return null;
}
