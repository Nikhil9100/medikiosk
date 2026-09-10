import { NextResponse } from "next/server";
import { databaseConfigured, withStaffTx } from "@/lib/db/pool";
import { clearStaffCookie, getStaffToken, logoutStaff } from "@/lib/staff-auth";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  if (databaseConfigured()) {
    const token = await getStaffToken();
    if (token) {
      await withStaffTx((client) => logoutStaff(client, token)).catch(() => {});
    }
  }
  clearStaffCookie(response);
  return response;
}
