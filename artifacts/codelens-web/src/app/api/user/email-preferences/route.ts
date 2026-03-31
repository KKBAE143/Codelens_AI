export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const [record] = await db
    .select({ emailNotifications: users.emailNotifications, email: users.email })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return NextResponse.json({
    emailNotifications: record?.emailNotifications ?? true,
    email: record?.email || null,
  });
}

export async function PATCH(request: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.emailNotifications !== "boolean") {
    return NextResponse.json({ error: "emailNotifications must be a boolean" }, { status: 400 });
  }

  await db
    .update(users)
    .set({
      emailNotifications: body.emailNotifications,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  return NextResponse.json({ success: true, emailNotifications: body.emailNotifications });
}
