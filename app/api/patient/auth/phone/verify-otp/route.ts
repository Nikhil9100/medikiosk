import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { maskPhoneNumber, normalizePhoneNumber, verifyPhoneOtp } from "@/lib/auth/otp";
import { databaseConfigured, withKioskTx, withOwnerTx } from "@/lib/db/pool";
import { createCase, getCase, touchPatientSession } from "@/lib/db/cases";
import { getActiveKioskSession, SESSION_COOKIE, sessionIdFromCookie } from "@/lib/db/session-scope";
import { caseToWorkflow } from "@/lib/patient-flow";
import { writeAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

const Body = z.object({
  phone: z.string().min(10).max(16),
  otp: z.string().min(6).max(8),
  language: z.enum(["en", "hi", "bn", "te", "ta", "mr"]).optional(),
}).strict();

function setCookie(res: NextResponse, id: string) {
  res.cookies.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 60,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const { phone, otp, language } = parsed.data;
  const verifyResult = await verifyPhoneOtp(phone, otp);
  if (!verifyResult.verified) {
    return NextResponse.json({ error: verifyResult.error || "Invalid OTP code." }, { status: 401 });
  }

  const masked = maskPhoneNumber(phone);
  const normPhone = normalizePhoneNumber(phone);

  if (!databaseConfigured()) {
    return NextResponse.json({
      ok: true,
      verified: true,
      maskedPhone: masked,
      message: "Phone verified successfully (demo mode).",
    });
  }

  try {
    // Check if user already has an active session
    let existingSession = await getActiveKioskSession();
    let sessionId: string;
    let workflowData: ReturnType<typeof caseToWorkflow>;

    if (existingSession && existingSession.status === "ACTIVE") {
      sessionId = existingSession.id;
      await withKioskTx(sessionId, async (c) => {
        await touchPatientSession(c, sessionId);
        await c.query(
          `INSERT INTO patient_identity_status(session_id, status, verification_source, verified_at)
           VALUES($1, 'VERIFIED', 'PHONE_OTP', now())
           ON CONFLICT(session_id) DO UPDATE SET status='VERIFIED', verification_source='PHONE_OTP', verified_at=now(), updated_at=now()`,
          [sessionId]
        );
        await writeAudit(
          c,
          { type: "PATIENT", id: sessionId },
          "identity.phone_verified",
          { type: "case", id: existingSession!.caseId },
          { maskedPhone: masked, method: "OTP" }
        );
      });
      const updatedCase = await withKioskTx(sessionId, (c) => getCase(c, sessionId));
      workflowData = caseToWorkflow(updatedCase || existingSession);
    } else {
      // Bootstrap a new session
      const ownerId = randomUUID();
      const idempotencyKey = `phone-${normPhone}-${Date.now()}`;
      const newCase = await withOwnerTx(ownerId, async (c) => {
        const created = await createCase(c, {
          ownerId,
          idempotencyKey,
          language: language || "en",
        });
        await c.query(
          `INSERT INTO patient_identity_status(session_id, status, verification_source, verified_at)
           VALUES($1, 'VERIFIED', 'PHONE_OTP', now())
           ON CONFLICT(session_id) DO UPDATE SET status='VERIFIED', verification_source='PHONE_OTP', verified_at=now(), updated_at=now()`,
          [created.id]
        );
        await writeAudit(
          c,
          { type: "PATIENT", id: created.id },
          "identity.phone_verified",
          { type: "case", id: created.caseId },
          { maskedPhone: masked, method: "OTP" }
        );
        return created;
      });
      sessionId = newCase.id;
      workflowData = caseToWorkflow(newCase);
    }

    const res = NextResponse.json({
      ok: true,
      verified: true,
      maskedPhone: masked,
      sessionId,
      workflow: workflowData,
      message: "Phone verified and visit initialized.",
    });

    setCookie(res, sessionId);
    return res;
  } catch (err) {
    console.warn("Database unavailable during phone verification, falling back to client demo session:", err);
    return NextResponse.json({
      ok: true,
      verified: true,
      maskedPhone: masked,
      message: "Phone verified successfully (demo mode).",
    });
  }
}

