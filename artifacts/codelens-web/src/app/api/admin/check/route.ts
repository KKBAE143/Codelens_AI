export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";

export async function GET() {
  const admin = await isAdmin();
  return NextResponse.json({ isAdmin: admin });
}
