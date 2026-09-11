import { NextResponse } from "next/server";
import { z } from "zod";
import type { PoolClient } from "pg";
import { databaseConfigured, withKioskTx } from "@/lib/db/pool";
import { getActiveKioskSession } from "@/lib/db/session-scope";
import { addComplaint, deleteComplaint, getComplaint, listComplaints, updateComplaint, type ComplaintRecord } from "@/lib/db/complaints";
import { transitionCase } from "@/lib/db/cases";

export const runtime = "nodejs";

const BODY_REGIONS = new Set(["head", "chest", "abdomen", "back", "arm", "hand", "leg", "foot", "skin", "other"]);
const BODY_SUBREGIONS = new Set(["front", "back", "left", "right", "upper", "lower", "middle", "face", "body"]);
const SEVERITIES = new Set(["MILD", "MODERATE", "SEVERE", "VERY_SEVERE"]);

const CreateComplaintSchema = z
  .object({
    complaintText: z.string().trim().min(1).max(2000),
    bodyRegion: z
      .string()
      .refine((v) => BODY_REGIONS.has(v), "Invalid body region")
      .nullable()
      .optional(),
    bodySubregion: z
      .string()
      .refine((v) => BODY_SUBREGIONS.has(v), "Invalid body subregion")
      .nullable()
      .optional(),
    severity: z
      .string()
      .refine((v) => SEVERITIES.has(v), "Invalid severity")
      .nullable()
      .optional(),
  })
  .strict();

export async function GET() {
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Session storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const session = await getActiveKioskSession();
  if (!session) return NextResponse.json({ error: "No active session" }, { status: 404 });
  const complaints = await withKioskTx(session.id, (client) => listComplaints(client, session.id));
  return NextResponse.json({ complaints });
}

export async function POST(request: Request) {
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Session storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const session = await getActiveKioskSession();
  if (!session) return NextResponse.json({ error: "No active session" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = CreateComplaintSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid complaint", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const complaint = await withKioskTx(session.id, async (client) => {
      // A case moves to IN_PROGRESS the moment real intake data exists.
      if (session.caseStatus === "NEW") {
        await transitionCase(client, session.id, "IN_PROGRESS", { type: "PATIENT", id: session.id });
      }
      const record = await addComplaint(client, {
        sessionId: session.id,
        complaintText: parsed.data.complaintText,
        bodyRegion: parsed.data.bodyRegion ?? null,
        bodySubregion: parsed.data.bodySubregion ?? null,
      });
      if (parsed.data.severity) {
        return (await updateComplaint(client, session.id, record.id, { severity: parsed.data.severity as never })) ?? record;
      }
      return record;
    });
    return NextResponse.json({ complaint }, { status: 201 });
  } catch (error) {
    console.error("Add complaint failed:", error);
    return NextResponse.json({ error: "Unable to add complaint" }, { status: 500 });
  }
}

const DeleteComplaintSchema = z.object({
  complaintId: z.string().min(1).max(64),
}).strict();

export async function DELETE(request: Request) {
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Session storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const session = await getActiveKioskSession();
  if (!session) return NextResponse.json({ error: "No active session" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = DeleteComplaintSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid delete request" }, { status: 400 });
  }

  try {
    const outcome = await withKioskTx(session.id, async (client) => {
      const complaint = await getComplaint(client, session.id, parsed.data.complaintId);
      if (!complaint) return { result: "missing" as const };
      if (complaint.position === 1) return { result: "chief" as const };
      const deleted = await deleteComplaint(client, session.id, complaint.id);
      return { result: (deleted ? "deleted" : "missing") as "deleted" | "missing" };
    });
    if (outcome.result === "missing") return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    if (outcome.result === "chief") {
      return NextResponse.json({ error: "The main complaint cannot be removed; you can edit it instead." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete complaint failed:", error);
    return NextResponse.json({ error: "Unable to remove complaint" }, { status: 500 });
  }
}

const UpdateComplaintSchema = z
  .object({
    complaintId: z.string().min(1).max(64),
    complaintText: z.string().trim().min(1).max(2000).optional(),
    bodyRegion: z
      .string()
      .refine((v) => BODY_REGIONS.has(v), "Invalid body region")
      .nullable()
      .optional(),
    bodySubregion: z
      .string()
      .refine((v) => BODY_SUBREGIONS.has(v), "Invalid body subregion")
      .nullable()
      .optional(),
    severity: z
      .string()
      .refine((v) => SEVERITIES.has(v), "Invalid severity")
      .nullable()
      .optional(),
  })
  .strict();

export async function PATCH(request: Request) {
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
    const record = await withKioskTx(session.id, (client) =>
      updateComplaint(client, session.id, parsed.data.complaintId, {
        ...(parsed.data.complaintText !== undefined ? { complaintText: parsed.data.complaintText } : {}),
        ...(parsed.data.bodyRegion !== undefined ? { bodyRegion: parsed.data.bodyRegion } : {}),
        ...(parsed.data.bodySubregion !== undefined ? { bodySubregion: parsed.data.bodySubregion } : {}),
        ...(parsed.data.severity !== undefined ? { severity: parsed.data.severity as never } : {}),
      })
    );
    if (!record) return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    return NextResponse.json({ complaint: record });
  } catch (error) {
    console.error("Update complaint failed:", error);
    return NextResponse.json({ error: "Unable to update complaint" }, { status: 500 });
  }
}

export type { ComplaintRecord };
export type { PoolClient };
