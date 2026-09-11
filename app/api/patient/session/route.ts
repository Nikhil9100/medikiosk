import { NextResponse } from "next/server";
import { PatientLanguage, PatientStep } from "@/lib/patient-flow";
import { PatientSessionRecordSchema, type PatientSessionRecord } from "@/lib/session";
import {
  databaseConfigured,
  withKioskTx,
  withNewSessionTx,
} from "@/lib/db/pool";
import { createCase, getCase, updateCase } from "@/lib/db/cases";
import { SESSION_COOKIE } from "@/lib/db/session-scope";
import { PostgresDocumentRepository } from "@/lib/db/documents-pg";

/**
 * Patient session API — durable, database-backed.
 *
 * Identity model: the browser is anonymous (kiosk). The server mints an
 * HTTP-only cookie carrying the session id; every request is scoped to that
 * session by row-level security. The Supabase path (see docs/ARCHITECTURE.md)
 * remains the production target; this PostgreSQL implementation is the live
 * backend for the integrated product.
 */

const SESSION_TTL_SECONDS = 30 * 60;

function toResponse(record: {
  id: string;
  status: "ACTIVE" | "EXPIRED" | "COMPLETED";
  language: PatientSessionRecord["language"];
  consentStatus: PatientSessionRecord["consentStatus"];
  consentVersion: string | null;
  consentTimestamp: Date | null;
  workflowStep: PatientSessionRecord["workflowStep"];
  complaintText: string | null;
  bodyRegion: string | null;
  bodySubregion: string | null;
  interviewData: Record<string, unknown> | null;
  demoFlag: boolean;
  caseId: string;
  caseStatus: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  completedAt: Date | null;
}): PatientSessionRecord & { caseId: string; caseStatus: string; demoFlag: boolean } {
  const session = {
    id: record.id,
    status: record.status,
    language: record.language,
    consentStatus: record.consentStatus,
    consentVersion: record.consentVersion,
    consentTimestamp: record.consentTimestamp ? record.consentTimestamp.toISOString() : null,
    workflowStep: record.workflowStep,
    complaintText: record.complaintText,
    bodyRegion: record.bodyRegion,
    bodySubregion: record.bodySubregion,
    interviewData: record.interviewData,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    completedAt: record.completedAt ? record.completedAt.toISOString() : null,
    caseId: record.caseId,
    caseStatus: record.caseStatus,
    demoFlag: record.demoFlag,
  };
  const core = PatientSessionRecordSchema.parse({
    id: session.id,
    status: session.status,
    language: session.language,
    consentStatus: session.consentStatus,
    consentVersion: session.consentVersion,
    consentTimestamp: session.consentTimestamp,
    workflowStep: session.workflowStep,
    complaintText: session.complaintText,
    bodyRegion: session.bodyRegion,
    bodySubregion: session.bodySubregion,
    interviewData: session.interviewData,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
    completedAt: session.completedAt,
  });
  return { ...core, caseId: session.caseId, caseStatus: session.caseStatus, demoFlag: session.demoFlag };
}

function setSessionCookie(response: NextResponse, sessionId: string) {
  response.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

function notConfigured() {
  return NextResponse.json(
    { error: "Session storage is not configured", code: "DB_NOT_CONFIGURED" },
    { status: 503 },
  );
}

export async function POST(request: Request) {
  if (!databaseConfigured()) return notConfigured();
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey || idempotencyKey.length > 128) {
    return NextResponse.json({ error: "An Idempotency-Key header is required" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const languageResult = PatientLanguage.safeParse((body as { language?: unknown })?.language ?? "en");
  if (!languageResult.success) {
    return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
  }
  const demoFlag = Boolean((body as { demo?: unknown })?.demo);

  // Server-generated pseudo-owner: the kiosk device session is anonymous, so
  // each case gets a fresh random owner id (never client-supplied).
  const ownerUuid = crypto.randomUUID();
  let record;
  try {
    record = await withNewSessionTx(ownerUuid, (client) =>
      createCase(client, { ownerUuid, idempotencyKey, language: languageResult.data, demoFlag }),
    );
  } catch (error) {
    console.error("Session create failed:", error);
    return NextResponse.json({ error: "Unable to create session" }, { status: 503 });
  }
  const response = NextResponse.json({ session: toResponse(record) }, { status: 201 });
  setSessionCookie(response, record.id);
  return response;
}

export async function GET() {
  if (!databaseConfigured()) return notConfigured();
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ error: "No active session" }, { status: 404 });

  // The session payload carries the patient's documents (with OCR results) so
  // a refresh rehydrates the documents step exactly where the patient left it.
  const loaded = await withKioskTx(sessionId, async (client) => {
    const record = await getCase(client, sessionId);
    if (!record) return null;
    const repository = new PostgresDocumentRepository(client);
    const documents = await repository.getSessionDocumentsWithOcr(sessionId);
    return { record, documents };
  }).catch(() => null);
  const session = loaded?.record ?? null;
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.status === "EXPIRED" || session.expiresAt.getTime() <= Date.now()) {
    if (session.status === "ACTIVE") {
      await withKioskTx(sessionId, (client) =>
        client.query(`UPDATE patient_sessions SET status = 'EXPIRED' WHERE id = $1 AND status = 'ACTIVE'`, [sessionId]),
      ).catch(() => {});
    }
    return NextResponse.json({ error: "Session expired" }, { status: 410 });
  }
  return NextResponse.json({ session: { ...toResponse(session), documents: loaded?.documents ?? [] } });
}

export async function PATCH(request: Request) {
  if (!databaseConfigured()) return notConfigured();
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ error: "No active session" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = body !== null ? parseSessionUpdate(body) : null;
  if (!parsed) return NextResponse.json({ error: "Invalid session update" }, { status: 400 });

  try {
    const updated = await withKioskTx(sessionId, async (client) => {
      const current = await getCase(client, sessionId);
      if (!current) return null;
      if (current.status !== "ACTIVE" || current.expiresAt.getTime() <= Date.now()) {
        return "INACTIVE" as const;
      }
      return updateCase(client, sessionId, {
        language: parsed.language,
        consentStatus: parsed.consentStatus,
        workflowStep: parsed.workflowStep,
        complaintText: parsed.complaintText,
        bodyRegion: parsed.bodyRegion,
        bodySubregion: parsed.bodySubregion,
        interviewData: parsed.interviewData,
      });
    });
    if (updated === null) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (updated === "INACTIVE") return NextResponse.json({ error: "Session is not active" }, { status: 410 });
    return NextResponse.json({ session: toResponse(updated) });
  } catch (error) {
    console.error("Session update failed:", error);
    return NextResponse.json({ error: "Unable to update session" }, { status: 503 });
  }
}

// Derived from the PatientStep enum so new workflow steps cannot drift out of sync.
const WORKFLOW_STEPS = new Set<string>(PatientStep.options);
const BODY_REGIONS = new Set(["head", "chest", "abdomen", "back", "arm", "hand", "leg", "foot", "skin", "other"]);
const BODY_SUBREGIONS = new Set(["front", "back", "left", "right", "upper", "lower", "middle", "face", "body"]);

function parseSessionUpdate(body: unknown) {
  const candidate = body as Record<string, unknown> | null;
  if (!candidate) return null;
  const result: {
    language?: (typeof PatientLanguage.options)[number];
    consentStatus?: "NOT_REVIEWED" | "ACCEPTED" | "DECLINED";
    workflowStep?: PatientStep;
    complaintText?: string | null;
    bodyRegion?: string | null;
    bodySubregion?: string | null;
    interviewData?: Record<string, unknown> | null;
  } = {};
  if (candidate.language !== undefined) {
    const parsed = PatientLanguage.safeParse(candidate.language);
    if (!parsed.success) return null;
    result.language = parsed.data;
  }
  if (candidate.consentStatus !== undefined) {
    if (!["NOT_REVIEWED", "ACCEPTED", "DECLINED"].includes(candidate.consentStatus as string)) return null;
    result.consentStatus = candidate.consentStatus as "NOT_REVIEWED" | "ACCEPTED" | "DECLINED";
  }
  if (candidate.workflowStep !== undefined) {
    if (typeof candidate.workflowStep !== "string" || !WORKFLOW_STEPS.has(candidate.workflowStep)) return null;
    result.workflowStep = candidate.workflowStep as PatientStep;
  }
  if (candidate.complaintText !== undefined) {
    if (candidate.complaintText !== null && typeof candidate.complaintText !== "string") return null;
    if (typeof candidate.complaintText === "string" && candidate.complaintText.length > 2000) return null;
    result.complaintText = candidate.complaintText;
  }
  if (candidate.bodyRegion !== undefined) {
    if (candidate.bodyRegion !== null && (typeof candidate.bodyRegion !== "string" || !BODY_REGIONS.has(candidate.bodyRegion))) return null;
    result.bodyRegion = candidate.bodyRegion;
  }
  if (candidate.bodySubregion !== undefined) {
    if (candidate.bodySubregion !== null && (typeof candidate.bodySubregion !== "string" || !BODY_SUBREGIONS.has(candidate.bodySubregion))) return null;
    result.bodySubregion = candidate.bodySubregion;
  }
  if (candidate.interviewData !== undefined) {
    if (candidate.interviewData !== null && typeof candidate.interviewData !== "object") return null;
    result.interviewData = candidate.interviewData as Record<string, unknown> | null;
  }
  return result;
}
