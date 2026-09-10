import { NextResponse } from "next/server";
import { databaseConfigured } from "@/lib/db/pool";
import { getAuthenticatedStaff } from "@/lib/staff-auth";

export const runtime = "nodejs";

export async function GET() {
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Staff storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const staff = await getAuthenticatedStaff();
  if (!staff) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json({
    staff: { id: staff.id, email: staff.email, displayName: staff.displayName, title: staff.title, role: staff.role },
  });
}
