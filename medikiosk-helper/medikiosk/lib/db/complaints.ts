import "server-only";

import type { PoolClient } from "pg";
import { Severity, type Severity as SeverityType } from "@/lib/case-status";
import { writeAudit } from "./audit";

export type ComplaintRecord = {
  id: string;
  sessionId: string;
  position: number;
  complaintText: string;
  bodyRegion: string | null;
  bodySubregion: string | null;
  severity: SeverityType | null;
  interviewData: Record<string, unknown> | null;
  status: "ACTIVE" | "CANCELLED";
  createdAt: Date;
  updatedAt: Date;
};

const complaintColumns = `id, session_id, position, complaint_text, body_region,
  body_subregion, severity, interview_data, status, created_at, updated_at`;

function toComplaint(row: Record<string, unknown>): ComplaintRecord {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    position: row.position as number,
    complaintText: row.complaint_text as string,
    bodyRegion: row.body_region as string | null,
    bodySubregion: row.body_subregion as string | null,
    severity: (row.severity as SeverityType | null) ?? null,
    interviewData: row.interview_data as Record<string, unknown> | null,
    status: row.status as ComplaintRecord["status"],
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export async function listComplaints(
  client: PoolClient,
  sessionId: string,
): Promise<ComplaintRecord[]> {
  const result = await client.query(
    `SELECT ${complaintColumns} FROM complaints
      WHERE session_id = $1 AND status = 'ACTIVE' ORDER BY position`,
    [sessionId],
  );
  return result.rows.map(toComplaint);
}

export async function addComplaint(
  client: PoolClient,
  params: {
    sessionId: string;
    complaintText: string;
    bodyRegion?: string | null;
    bodySubregion?: string | null;
  },
): Promise<ComplaintRecord> {
  const result = await client.query(
    `INSERT INTO complaints (session_id, position, complaint_text, body_region, body_subregion)
     VALUES ($1, (SELECT COALESCE(MAX(position), 0) + 1 FROM complaints WHERE session_id = $1),
             $2, $3, $4)
     RETURNING ${complaintColumns}`,
    [params.sessionId, params.complaintText, params.bodyRegion ?? null, params.bodySubregion ?? null],
  );
  await writeAudit(client, { type: "PATIENT", id: params.sessionId }, "complaint.added", {
    type: "complaint",
    id: result.rows[0].id,
  });
  return toComplaint(result.rows[0]);
}

export type ComplaintUpdate = {
  complaintText?: string;
  bodyRegion?: string | null;
  bodySubregion?: string | null;
  severity?: SeverityType | null;
  interviewData?: Record<string, unknown> | null;
  status?: "ACTIVE" | "CANCELLED";
};

export async function updateComplaint(
  client: PoolClient,
  sessionId: string,
  complaintId: string,
  changes: ComplaintUpdate,
): Promise<ComplaintRecord | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (changes.complaintText !== undefined) sets.push(`complaint_text = $${values.push(changes.complaintText)}`);
  if (changes.bodyRegion !== undefined) sets.push(`body_region = $${values.push(changes.bodyRegion)}`);
  if (changes.bodySubregion !== undefined) sets.push(`body_subregion = $${values.push(changes.bodySubregion)}`);
  if (changes.severity !== undefined) {
    if (changes.severity !== null && !Severity.safeParse(changes.severity).success) {
      throw new Error("Invalid severity value");
    }
    sets.push(`severity = $${values.push(changes.severity)}`);
  }
  if (changes.interviewData !== undefined) sets.push(`interview_data = $${values.push(changes.interviewData)}`);
  if (changes.status !== undefined) sets.push(`status = $${values.push(changes.status)}`);
  if (sets.length === 0) return getComplaint(client, sessionId, complaintId);
  values.push(sessionId, complaintId);
  const result = await client.query(
    `UPDATE complaints SET ${sets.join(", ")}
      WHERE session_id = $${values.length - 1} AND id = $${values.length}
      RETURNING ${complaintColumns}`,
    values,
  );
  return result.rows.length > 0 ? toComplaint(result.rows[0]) : null;
}

export async function getComplaint(
  client: PoolClient,
  sessionId: string,
  complaintId: string,
): Promise<ComplaintRecord | null> {
  const result = await client.query(
    `SELECT ${complaintColumns} FROM complaints WHERE session_id = $1 AND id = $2`,
    [sessionId, complaintId],
  );
  return result.rows.length > 0 ? toComplaint(result.rows[0]) : null;
}

export async function deleteComplaint(
  client: PoolClient,
  sessionId: string,
  complaintId: string,
): Promise<boolean> {
  const result = await client.query(
    `DELETE FROM complaints WHERE session_id = $1 AND id = $2`,
    [sessionId, complaintId],
  );
  if ((result.rowCount ?? 0) > 0) {
    // Re-number remaining complaints so positions stay dense.
    await client.query(
      `UPDATE complaints c SET position = n.new_position
         FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position) AS new_position
                 FROM complaints WHERE session_id = $1 AND status = 'ACTIVE') n
        WHERE c.id = n.id AND n.new_position <> c.position`,
      [sessionId],
    );
  }
  return (result.rowCount ?? 0) > 0;
}
