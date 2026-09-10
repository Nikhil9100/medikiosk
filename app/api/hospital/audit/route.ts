import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseConfigured, withStaffTx } from "@/lib/db/pool";
import { getAuthenticatedStaff } from "@/lib/staff-auth";

export const runtime = "nodejs";

const QuerySchema = z
  .object({
    limit: z.number().int().min(1).max(500).optional(),
    targetType: z.string().optional(),
    targetId: z.string().optional(),
  })
  .strict();

/**
 * GET /api/hospital/audit
 * Append-only audit trail (HOSPITAL role). Read-only: the audit log has no
 * UPDATE/DELETE grants for the application role at all.
 */
export async function GET(request: Request) {
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Hospital storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const staff = await getAuthenticatedStaff();
  if (!staff) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (staff.role !== "HOSPITAL") {
    return NextResponse.json({ error: "Hospital operations role required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const query = {
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
    targetType: url.searchParams.get("targetType") ?? undefined,
    targetId: url.searchParams.get("targetId") ?? undefined,
  };
  const parsed = QuerySchema.safeParse(query);
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const clauses: string[] = [];
  const values: unknown[] = [];
  if (parsed.data.targetType) {
    values.push(parsed.data.targetType);
    clauses.push(`target_type = $${values.length}`);
  }
  if (parsed.data.targetId) {
    values.push(parsed.data.targetId);
    clauses.push(`target_id = $${values.length}`);
  }
  values.push(parsed.data.limit ?? 200);
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const rows = await withStaffTx((client) =>
    client.query(
      `SELECT actor_type, actor_id, action, target_type, target_id, detail, created_at
         FROM audit_log ${where} ORDER BY created_at DESC, id DESC LIMIT $${values.length}`,
      values,
    ),
  );

  return NextResponse.json({
    audit: rows.rows.map((r) => ({
      actorType: r.actor_type,
      actorId: r.actor_id,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      detail: r.detail,
      createdAt: (r.created_at as Date).toISOString(),
    })),
  });
}
