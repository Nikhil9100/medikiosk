import { NextResponse } from "next/server";
import { getActiveKioskSession, patientWritable } from "@/lib/db/session-scope";
import { withKioskTx } from "@/lib/db/pool";
import { last4, maskAbhaAddress, validAbhaAddress, validAbhaNumber } from "@/lib/patient-identity";
import { writeAudit } from "@/lib/db/audit";

export async function POST(request: Request) {
  const s = await getActiveKioskSession();
  if (!s) return NextResponse.json({ error: "No active session" }, { status: 404 });
  if (s.consentStatus !== "ACCEPTED") return NextResponse.json({ error: "Consent required" }, { status: 403 });
  if (!patientWritable(s)) return NextResponse.json({ error: "Case is read-only" }, { status: 409 });

  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  if (b.skip === true || (!b.abhaNumber && !b.abhaAddress)) {
    await withKioskTx(s.id, async (c) => {
      await c.query(
        `INSERT INTO patient_identity_status(session_id,status) VALUES($1,'NOT_PROVIDED') ON CONFLICT(session_id) DO UPDATE SET status='NOT_PROVIDED',abha_last4=NULL,abha_address_masked=NULL,updated_at=now()`,
        [s.id]
      );
      await c.query(`UPDATE patient_sessions SET workflow_step='start' WHERE id=$1`, [s.id]);
      await writeAudit(c, { type: "PATIENT", id: s.id }, "identity.skipped", { type: "case", id: s.caseId }, { optionalIdentitySkipped: true });
    });
    return NextResponse.json({ status: "NOT_PROVIDED" });
  }

  if (b.abhaNumber && !validAbhaNumber(String(b.abhaNumber))) {
    return NextResponse.json({ error: "Invalid ABHA number" }, { status: 400 });
  }
  if (b.abhaAddress && !validAbhaAddress(String(b.abhaAddress))) {
    return NextResponse.json({ error: "Invalid ABHA address" }, { status: 400 });
  }

  const isVerified = b.verified === true && (b.verificationSource === "ABDM_OTP" || b.verificationSource === "PHONE_OTP");
  const targetStatus = isVerified ? "VERIFIED" : "SELF_DECLARED";
  const source = isVerified ? b.verificationSource : "SELF_DECLARED";

  const result = await withKioskTx(s.id, async (c) => {
    const n = b.abhaNumber ? last4(String(b.abhaNumber)) : null;
    const a = b.abhaAddress ? maskAbhaAddress(String(b.abhaAddress)) : null;
    await c.query(
      `INSERT INTO patient_identity_status(session_id,status,abha_last4,abha_address_masked,verification_source,verified_at)
       VALUES($1,$2,$3,$4,$5,CASE WHEN $2='VERIFIED' THEN now() ELSE NULL END)
       ON CONFLICT(session_id) DO UPDATE SET status=$2,abha_last4=$3,abha_address_masked=$4,verification_source=$5,verified_at=CASE WHEN $2='VERIFIED' THEN now() ELSE patient_identity_status.verified_at END,updated_at=now()`,
      [s.id, targetStatus, n, a, source]
    );
    await c.query(`UPDATE patient_sessions SET workflow_step='start' WHERE id=$1`, [s.id]);
    await writeAudit(
      c,
      { type: "PATIENT", id: s.id },
      isVerified ? "identity.abdm_verified" : "identity.self_declared",
      { type: "case", id: s.caseId },
      { hasNumber: Boolean(n), hasAddress: Boolean(a), fullUnverifiedIdentifierStored:false, verified: isVerified }
    );
    return { status: targetStatus, abhaLast4: n, abhaAddressMasked: a, verified: isVerified };
  });

  return NextResponse.json(result);
}
