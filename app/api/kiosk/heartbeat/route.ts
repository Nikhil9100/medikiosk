import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseConfigured, withKioskDeviceTx } from "@/lib/db/pool";
import { recordHeartbeat } from "@/lib/db/kiosk";

export const runtime = "nodejs";

const HeartbeatSchema = z
  .object({
    kioskId: z.string().min(1).max(64),
    label: z.string().max(80).optional(),
    activeSessionId: z.string().uuid().nullable().optional(),
    lastActivity: z.string().max(160).optional(),
  })
  .strict();

/**
 * POST /api/kiosk/heartbeat
 *
 * Kiosk devices report liveness every ~30s while a patient flow is open.
 * The row is scoped to the device by RLS (a kiosk can only write its own
 * kiosk_id), so a misbehaving or compromised kiosk cannot forge another
 * device's telemetry.
 */
export async function POST(request: Request) {
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Telemetry is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const parsed = HeartbeatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid heartbeat" }, { status: 400 });
  }
  const { kioskId, label, activeSessionId, lastActivity } = parsed.data;

  try {
    await withKioskDeviceTx(kioskId, (client) =>
      recordHeartbeat(client, kioskId, label ?? null, activeSessionId ?? null, lastActivity ?? null),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Heartbeat failed:", error);
    return NextResponse.json({ error: "Unable to record heartbeat" }, { status: 500 });
  }
}
