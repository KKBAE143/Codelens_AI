import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { testCloudflareCredentials } from "@/lib/llm";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { accountId, authToken } = body;

    if (!accountId || !authToken) {
      return NextResponse.json({ error: "accountId and authToken are required" }, { status: 400 });
    }

    const result = await testCloudflareCredentials(accountId, authToken);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Test failed" },
      { status: 500 },
    );
  }
}
