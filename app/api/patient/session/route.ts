import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PatientLanguage } from "@/lib/patient-flow";
import {
  canTransitionStatus,
  PatientSessionRecordSchema,
  SessionUpdateSchema,
  type PatientSessionRecord,
} from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const sessionCookie = "medikiosk_session";
const consentVersion = "phase-2-v1";
const sessionColumns = "id,status,language,consent_status,consent_version,consent_timestamp,workflow_step,complaint_text,body_region,body_subregion,interview_data,created_at,updated_at,expires_at,completed_at";

type SessionRow = {
  id: string;
  status: PatientSessionRecord["status"];
  language: PatientSessionRecord["language"];
  consent_status: PatientSessionRecord["consentStatus"];
  consent_version: string | null;
  consent_timestamp: string | null;
  workflow_step: PatientSessionRecord["workflowStep"];
  complaint_text: string | null;
  body_region: PatientSessionRecord["bodyRegion"];
  body_subregion: PatientSessionRecord["bodySubregion"];
  interview_data: PatientSessionRecord["interviewData"];
  created_at: string;
  updated_at: string;
  expires_at: string;
  completed_at: string | null;
};

function toResponse(row: SessionRow) {
  const session = {
    id: row.id,
    status: row.status,
    language: row.language,
    consentStatus: row.consent_status,
    consentVersion: row.consent_version,
    consentTimestamp: row.consent_timestamp,
    workflowStep: row.workflow_step,
    complaintText: row.complaint_text,
    bodyRegion: row.body_region,
    bodySubregion: row.body_subregion,
    interviewData: row.interview_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
  } satisfies PatientSessionRecord;
  return PatientSessionRecordSchema.parse(session);
}

function setSessionCookie(response: NextResponse, sessionId: string) {
  response.cookies.set(sessionCookie, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 60,
  });
}

async function getAuthenticatedClient() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { supabase, user: null };
  return { supabase, user: data.user };
}

async function getSessionId() {
  const cookieStore = await cookies();
  return cookieStore.get(sessionCookie)?.value;
}

export async function POST(request: Request) {
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

  const { supabase, user } = await getAuthenticatedClient();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const existing = await supabase.from("patient_sessions").select(sessionColumns).eq("idempotency_key", idempotencyKey).maybeSingle<SessionRow>();
  if (existing.error) return NextResponse.json({ error: "Unable to read session" }, { status: 503 });
  if (existing.data) {
    const response = NextResponse.json({ session: toResponse(existing.data) }, { status: 200 });
    setSessionCookie(response, existing.data.id);
    return response;
  }

  const inserted = await supabase.from("patient_sessions").insert({
    owner_id: user.id,
    language: languageResult.data,
    idempotency_key: idempotencyKey,
    consent_status: "NOT_REVIEWED",
    workflow_step: "welcome",
  }).select(sessionColumns).single<SessionRow>();

  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const retry = await supabase.from("patient_sessions").select(sessionColumns).eq("idempotency_key", idempotencyKey).single<SessionRow>();
      if (retry.data) {
        const response = NextResponse.json({ session: toResponse(retry.data) }, { status: 200 });
        setSessionCookie(response, retry.data.id);
        return response;
      }
    }
    return NextResponse.json({ error: "Unable to create session" }, { status: 503 });
  }

  const response = NextResponse.json({ session: toResponse(inserted.data) }, { status: 201 });
  setSessionCookie(response, inserted.data.id);
  return response;
}

export async function GET() {
  const { supabase, user } = await getAuthenticatedClient();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const id = await getSessionId();
  if (!id) return NextResponse.json({ error: "No active session" }, { status: 404 });

  const result = await supabase.from("patient_sessions").select(sessionColumns).eq("id", id).maybeSingle<SessionRow>();
  if (result.error) return NextResponse.json({ error: "Unable to read session" }, { status: 503 });
  if (!result.data) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (result.data.status === "ACTIVE" && new Date(result.data.expires_at).getTime() <= Date.now()) {
    await supabase.from("patient_sessions").update({ status: "EXPIRED" }).eq("id", id).eq("status", "ACTIVE");
    return NextResponse.json({ error: "Session expired" }, { status: 410 });
  }
  if (result.data.status === "EXPIRED") return NextResponse.json({ error: "Session expired" }, { status: 410 });
  return NextResponse.json({ session: toResponse(result.data) });
}

export async function PATCH(request: Request) {
  const parsed = SessionUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid session update" }, { status: 400 });
  const { supabase, user } = await getAuthenticatedClient();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const id = await getSessionId();
  if (!id) return NextResponse.json({ error: "No active session" }, { status: 404 });

  const current = await supabase.from("patient_sessions").select(sessionColumns).eq("id", id).maybeSingle<SessionRow>();
  if (current.error) return NextResponse.json({ error: "Unable to read session" }, { status: 503 });
  if (!current.data) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (current.data.status !== "ACTIVE" || new Date(current.data.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Session is not active" }, { status: 410 });
  }

  const changes: Record<string, string | null | Record<string, unknown>> = {};
  if (parsed.data.language) changes.language = parsed.data.language;
  if (parsed.data.workflowStep) changes.workflow_step = parsed.data.workflowStep;
  if (parsed.data.complaintText !== undefined) changes.complaint_text = parsed.data.complaintText;
  if (parsed.data.bodyRegion !== undefined) changes.body_region = parsed.data.bodyRegion;
  if (parsed.data.bodySubregion !== undefined) changes.body_subregion = parsed.data.bodySubregion;
  if (parsed.data.interviewData !== undefined) changes.interview_data = parsed.data.interviewData;
  if (parsed.data.consentStatus) {
    changes.consent_status = parsed.data.consentStatus;
    changes.consent_version = parsed.data.consentStatus === "NOT_REVIEWED" ? null : consentVersion;
    changes.consent_timestamp = parsed.data.consentStatus === "NOT_REVIEWED" ? null : new Date().toISOString();
  }
  if (parsed.data.status && canTransitionStatus(current.data.status, parsed.data.status)) {
    changes.status = parsed.data.status;
    changes.completed_at = new Date().toISOString();
  }

  const updated = await supabase.from("patient_sessions").update(changes).eq("id", id).eq("owner_id", user.id).select(sessionColumns).single<SessionRow>();
  if (updated.error) return NextResponse.json({ error: "Unable to update session" }, { status: 503 });
  return NextResponse.json({ session: toResponse(updated.data) });
}
