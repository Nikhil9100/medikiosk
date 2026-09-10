import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseConfigured, withKioskTx } from "@/lib/db/pool";
import { getActiveKioskSession } from "@/lib/db/session-scope";
import { deleteComplaint, getComplaint, updateComplaint } from "@/lib/db/complaints";

export const runtime = "nodejs";

const UpdateComplaintSchema = z
  .object({
    complaintText: z.string().trim().min(1).max(2000).optional(),
    bodyRegion: z.string().nullable().optional(),
    bodySubregion: z.string().nullable().optional(),
    severity: z.enum(["MILD", "MODERATE", "SEVERE", "VERY_SEVERE"]).nullable().optional(),
    interviewData: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Session storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const session = await getActiveKioskSession();
  if (!session) return NextResponse.json({ error: "No active session" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = UpdateComplaintSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const complaint = await withKioskTx(session.id, (client) =>
      updateComplaint(client, session.id, id, {
        complaintText: parsed.data.complaintText,
        bodyRegion: parsed.data.bodyRegion,
        bodySubregion: parsed.data.bodySubregion,
        severity: parsed.data.severity,
        interviewData: parsed.data.interviewData,
      }),
    );
    if (!complaint) return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    return NextResponse.json({ complaint });
  } catch (error) {
    console.error("Update complaint failed:", error);
    return NextResponse.json({ error: "Unable to update complaint" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Session storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const session = await getActiveKioskSession();
  if (!session) return NextResponse.json({ error: "No active session" }, { status: 404 });

  try {
    const existed = await withKioskTx(session.id, (client) => getComplaint(client, session.id, id));
    if (!existed) return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    const deleted = await withKioskTx(session.id, (client) => deleteComplaint(client, session.id, id));
    if (!deleted) return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Delete complaint failed:", error);
    return NextResponse.json({ error: "Unable to delete complaint" }, { status: 500 });
  }
}
