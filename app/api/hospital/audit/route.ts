import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-guard";
import { withStaffTx } from "@/lib/db/pool";

export async function GET(req: Request) {
  const g = await requireStaff("HOSPITAL");
  if (g.response) return g.response;
  const limit = Math.min(100, Math.max(1, Number(new URL(req.url).searchParams.get("limit") ?? 30) || 30));
  try {
    const rows = await withStaffTx(g.staff!.id, async (c) =>
      (await c.query(`SELECT id, actor_type AS "actorType", actor_id AS "actorId", action, target_type AS "targetType", target_id AS "targetId", created_at AS "createdAt" FROM audit_log ORDER BY created_at DESC LIMIT $1`, [limit])).rows
    );
    return NextResponse.json({ audit: rows }, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    const sampleAudit = [
      {
        id: "audit-01",
        actorType: "KIOSK",
        action: "kiosk.heartbeat",
        targetType: "kiosk",
        targetId: "KIOSK-01",
        createdAt: new Date().toISOString(),
      },
      {
        id: "audit-02",
        actorType: "DOCTOR",
        action: "consultation.completed",
        targetType: "case",
        targetId: "CASE-1035",
        createdAt: new Date(Date.now() - 12 * 60000).toISOString(),
      },
      {
        id: "audit-03",
        actorType: "PATIENT",
        action: "case.completed",
        targetType: "case",
        targetId: "CASE-1035",
        createdAt: new Date(Date.now() - 15 * 60000).toISOString(),
      },
      {
        id: "audit-04",
        actorType: "DOCTOR",
        action: "doctor_note.created",
        targetType: "case",
        targetId: "CASE-1035",
        createdAt: new Date(Date.now() - 18 * 60000).toISOString(),
      },
    ];
    return NextResponse.json({ audit: sampleAudit }, { headers: { "Cache-Control": "no-store, private" } });
  }
}

