import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { DATA_EXPORT_RATE_LIMIT, exportUserData } from "@/lib/user-data-export";
import { consumeRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";

/**
 * Download personal data archive (#571).
 * Returns JSON of issues, comments, votes, and points.
 */
export async function GET() {
  try {
    const user = await requireUser();

    // #1024: the dump is four unbounded queries plus a full serialize, so it
    // is rate limited rather than left open to repeated calls.
    if (!(await consumeRateLimit(`user-export:${user.id}`, DATA_EXPORT_RATE_LIMIT)).allowed) {
      return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
    }

    const data = await exportUserData(prisma, user.id);

    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="data-export-${user.id}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api/user/export] Export failed:", error);
    return new NextResponse(
      JSON.stringify({ error: "Failed to export user data" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
