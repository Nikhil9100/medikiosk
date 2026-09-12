# MediKiosk — Development Summary

This document summarizes the release candidate packaged in `Medi.zip`.

## Patient Console

- Patient-friendly green/white institutional UI aligned to the approved reference artwork.
- Mobile-first and laptop-friendly responsive layout.
- Welcome + six-language selection.
- Consent-first intake.
- Optional ABHA with privacy-minimized self-declared storage; full unverified ABHA is not retained/cached offline.
- Chief complaint by text or microphone.
- Severity + affected body-area selection.
- Additional symptoms.
- Adaptive interview preserving KNOWN / UNKNOWN / DECLINED / DENIED semantics.
- Medi patient assistant with typed chat, microphone input, persisted conversation, RAG citations, deterministic safety messaging and Sarvam Bulbul v3 Priya female TTS when configured.
- Document upload, OCR, evidence extraction, retry/idempotency protection and delete-before-submission.
- Durable completion and New Patient handoff.
- Encrypted offline-resume support for safe text/workflow state with ordered replay after reconnection.
- Separate secure resume credential with bounded recovery window.
- Full ABHA values, medical-file binaries and microphone blobs are intentionally excluded from offline cache.

## Doctor Console

- Doctor-only urgent-first clinical queue with search/filtering.
- Full patient case view: complaints, structured interview, documents, extracted evidence, provenance, uncertainty, safety signals and Medi conversation.
- Physician evidence authority: Verify / Reject / Reset.
- Safety-signal authority: Review / Escalate / Dismiss.
- Doctor notes with failure-safe draft retention.
- Consultation start/complete lifecycle; completion blocks unresolved urgent signals.
- Exact canonical 10-part Dashavidha Atura Pariksha: Prakriti, Vikriti, Sara, Samhanana, Pramana, Satmya, Sattva, Ahara Shakti, Vyayama Shakti and Vaya.
- Doctor-only FHIR R4 document Bundle export.
- Optional identity status without exposing a full unverified ABHA value.

## Hospital Console

- District-hospital/e-Hospital-inspired operations workspace while remaining clearly independent and non-government-affiliated.
- DB-derived OPD/pre-consultation flow, urgent load, in-consultation, completed-today and wait-time metrics.
- Kiosk health network with ONLINE / ATTENTION / OFFLINE states.
- Document-processing pipeline.
- Staff-on-duty derived from valid staff sessions.
- Operational audit feed.
- Hospital role intentionally excludes chief-complaint PHI and doctor-only case details.

## Security and Reliability

- Supabase-hosted PostgreSQL canonical data model.
- Forced RLS on sensitive tables using transaction-scoped application context.
- Least-privilege application-role preflight and RLS regression tooling.
- HttpOnly cookies; Secure in production; SameSite=Lax.
- Scrypt staff password hashing and hashed session tokens.
- DB-backed login throttling.
- Production kiosk-heartbeat authentication.
- Security headers, no-store clinical responses and noindex behavior.
- Audit events for important staff/patient actions.
- Upload and Medi chat response-loss idempotency.
- OCR/extraction claim → process outside transaction → atomic finalize workflow.
- Queue capacity fails closed instead of silently dropping unsynced patient work.

## Interoperability boundary

- Optional ABHA capture is not presented as verification.
- FHIR R4 export is implemented for authenticated doctors.
- Status is explicitly `ABDM_READY_PREVIEW`.
- No claim of live ABDM/HIE-CM integration or government certification is made.

## UI and responsiveness

- Approved Patient Console reference image is preserved at `docs/reference/patient-console-approved-reference.png`.
- Responsive contracts cover phone, tablet and laptop layouts.
- Doctor/Hospital desktop tables convert into readable mobile cards.
- Safe wrapping, touch targets, safe-area handling and reduced-motion support are retained.

## Current automated result

At the final packaging retest:

- `node scripts/quality-gate.mjs`: **PASS — 53/53 checks + full TypeScript/TSX syntax-transpile sweep**.
- `node --test tests/*.test.mjs`: **PASS — 77/77 tests, 0 failures**.

See `SENIOR_QA_REPORT.md`, `VERIFICATION.md` and `CHECKPUSH.md` for detailed evidence and remaining infrastructure-dependent release gates.
