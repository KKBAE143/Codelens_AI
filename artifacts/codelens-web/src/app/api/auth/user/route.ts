export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ user: null, authenticated: false });
    }
    return NextResponse.json({ user, authenticated: true });
  } catch {
    return NextResponse.json({ user: null, authenticated: false });
  }
}
