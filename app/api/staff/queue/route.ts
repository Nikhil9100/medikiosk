import { NextResponse } from "next/server";
import { databaseConfigured, withStaffTx } from "@/lib/db/pool";
import { getAuthenticatedStaff } from "@/lib/staff-auth";
import { listQueueCases } from "@/lib/db/cases";

export const runtime = "nodejs";

/**
 * GET /api/staff/queue
 * The live case queue for doctor and hospital staff, derived entirely from
 * real state (complaints, signals, documents counted in SQL).
 */
export async function GET() {
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Staff storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const staff = await getAuthenticatedStaff();
  if (!staff) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const cases = await withStaffTx((client) => listQueueCases(client));
  const now = Date.now();
  return NextResponse.json({
    cases: cases.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      completedAt: c.completedAt ? c.completedAt.toISOString() : null,
      startedAt: c.startedAt ? c.startedAt.toISOString() : null,
      waitSeconds: c.caseStatus === "AWAITING_REVIEW" || c.caseStatus === "URGENT_REVIEW"
        ? Math.max(0, Math.floor((now - c.createdAt.getTime()) / 1000))
        : null,
    })),
  });
}
