export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { deleteSession, SESSION_COOKIE } from "@/lib/auth";

function getOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  return `${forwardedProto}://${forwardedHost}`;
}

export async function GET(request: NextRequest) {
  const sid = request.cookies.get(SESSION_COOKIE)?.value;
  if (sid) {
    await deleteSession(sid);
  }

  const origin = getOrigin(request);
  const response = NextResponse.redirect(origin);
  response.cookies.delete(SESSION_COOKIE);

  return response;
}
