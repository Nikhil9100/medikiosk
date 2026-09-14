import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmAbdmVerification } from "@/lib/abdm";
import { getActiveKioskSession, patientWritable } from "@/lib/db/session-scope";
import { withKioskTx } from "@/lib/db/pool";
import { writeAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

const Body = z.object({
  txnId: z.string().min(1).max(64),
  otp: z.string().min(6).max(8),
}).strict();

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid verification payload." }, { status: 400 });
  }

  const { txnId, otp } = parsed.data;
  const verifyResult = await confirmAbdmVerification(txnId, otp);
  if (!verifyResult.verified || !verifyResult.profile) {
    return NextResponse.json({ error: verifyResult.error || "OTP verification failed." }, { status: 401 });
  }

  const profile = verifyResult.profile;
  const s = await getActiveKioskSession();

  if (s) {
    if (!patientWritable(s)) {
      return NextResponse.json({ error: "Case is read-only" }, { status: 409 });
    }

    try {
      await withKioskTx(s.id, async (c) => {
        await c.query(
          `INSERT INTO patient_identity_status(session_id, status, abha_last4, abha_address_masked, verification_source, verified_at)
           VALUES($1, 'VERIFIED', $2, $3, 'ABDM_OTP', now())
           ON CONFLICT(session_id) DO UPDATE
           SET status='VERIFIED', abha_last4=$2, abha_address_masked=$3, verification_source='ABDM_OTP', verified_at=now(), updated_at=now()`,
          [s.id, profile.abhaLast4, profile.abhaAddressMasked]
        );
        await c.query(`UPDATE patient_sessions SET workflow_step='start' WHERE id=$1`, [s.id]);
        await writeAudit(
          c,
          { type: "PATIENT", id: s.id },
          "identity.abdm_verified",
          { type: "case", id: s.caseId },
          {
            hasNumber: Boolean(profile.abhaLast4),
            hasAddress: Boolean(profile.abhaAddressMasked),
            fullUnverifiedIdentifierStored: false,
            verified: true,
            verificationSource: "ABDM_OTP",
          }
        );
      });
    } catch (dbErr) {
      console.warn("Database unavailable during ABHA verification:", dbErr);
    }
  }

  return NextResponse.json({
    ok: true,
    verified: true,
    profile,
    message: "ABHA verified successfully via ABDM OTP.",
  });
}
