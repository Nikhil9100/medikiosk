# MediKiosk

**Digital Clinical History** — a patient pre-consultation kiosk with connected Doctor and Hospital Operations consoles. A patient records their medical history on a touch kiosk *before* the consultation; the doctor enters the room already knowing the complaints, history, digitized documents, and any safety signals; the hospital sees the whole pipeline live.

MediKiosk is **not an autonomous AI doctor**. It is patient pre-consultation, structured clinical history, document digitization (OCR + structured extraction), safety-signal triage, AYUSH/Dashavidha support, physician review, and hospital operations. AI assists; the physician remains the final clinical authority.

> MediKiosk is an independent product. It has no affiliation with, or endorsement by, any government department or ministry, and displays no official seals.

## Consoles

| Console | Path | Who | What |
|---|---|---|---|
| Patient Kiosk | `/patient` | Patient | 6-language guided intake: language → consent → complaint → visual anatomy → multiple complaints + severity → adaptive interview → documents (OCR + extraction) → completion |
| Doctor | `/doctor` | Physician (`DOCTOR` role) | Triage queue, full case review, evidence verification (AI ≠ Doctor-Verified), contradiction resolution, safety-signal review, Dashavidha observations, consultations, notes |
| Hospital Operations | `/hospital` | Ops lead (`HOSPITAL` role) | Live funnel, active-case queue, document-processing pipeline, kiosk device network (ONLINE / ATTENTION / OFFLINE / SESSION INTERRUPTED + triage), staff on duty, audit feed |

Demo staff (development only — **not** production credentials):
- Doctor: `doctor@medikiosk.local` / `doctor-demo-2026`
- Hospital: `hospital@medikiosk.local` / `hospital-demo-2026`

## Architecture

- **Next.js 16** (App Router) + React + strict TypeScript; `next start` production server
- **PostgreSQL 17** — all state. Row-Level Security enforces patient/kiosk/staff ownership at the database layer (the app is not the only boundary)
- **Sessions**: kiosk sessions are durable DB rows with an `Idempotency-Key` on creation, cookie-based, expiring (410 after expiry, safe denial of PHI)
- **OCR**: Tesseract.js in-server (en/hi/bn/te/ta/mr), per-page timeout, honest `FAILED` + retry
- **Structured extraction**: deterministic rules engine producing evidence items with WHAT / SOURCE (OCR span, page) / METHOD / CONFIDENCE / VERIFICATION. Contradictions (e.g. patient "no medicines" vs document "Metformin 500 mg") are **surfaced with both sources — never auto-resolved**
- **Verification**: AI/OCR evidence is always `UNVERIFIED` until a physician verifies or rejects it; confidence ≠ verification
- **Provenance**: every clinical fact carries `PATIENT | VOICE | TOUCH | OCR | AI | DOCTOR | SYSTEM`
- **Interview semantics**: `KNOWN / UNKNOWN / DECLINED / DENIED / NOT_ASKED` are distinct stored states — a missing answer is never converted to "No"
- **Safety signals**: urgent-language detection surfaces "safety signal detected — requires physician assessment" (never a diagnosis), multilingual
- **AYUSH / Dashavidha Pariksha**: 8 classical dimensions, physician-recorded (provenance `DOCTOR`), unassessed dimensions stay `NOT_ASSESSED` — never fabricated; kept visibly separate from Modern-Medicine evidence
- **RAG assistant ("Medi")**: one consistent female assistant identity. Deterministic retrieval over a curated dual corpus (Ayurveda + Modern, PostgreSQL full-text search with relevance gating). Answers carry real citations; no-result, garbage, and prompt-injection inputs produce honest no-matches — no fabricated citations. KB content is isolated from patient data in both directions
- **Voice**: optional mic→transcribe and text→speak (Sarvam provider). When the provider is unconfigured or hardware is missing, the UI fails honestly ("voice unavailable", retry) — never fake success
- **Kiosk heartbeat**: devices report liveness; the hospital console derives real device states and the SESSION INTERRUPTED condition, with an ops triage action
- **Audit log**: append-only record of staff clinical actions

### Data model (17 tables)

`patient_sessions`, `complaints`, `documents`, `ocr_results`, `document_extractions`, `clinical_evidence`, `safety_signals`, `dashavidha_observations`, `consultations`, `doctor_notes`, `chat_messages`, `knowledge_documents`, `knowledge_chunks`, `staff`, `staff_sessions`, `kiosk_heartbeats`, `audit_log`

## Security

- **Patient isolation via RLS**: a session can only read/write its own rows (enforced by DB policies, regression-tested in `npm run test:rls`)
- **Role enforcement server-side**: `GET /api/hospital/overview` requires the `HOSPITAL` role (401 anonymous / 403 other roles / 200 hospital); physician-only routes (case bundle, queue, evidence verification, Dashavidha, doctor notes, safety-signal review) reject non-`DOCTOR` staff with 403
- **Consent gate at the API**: no clinical write (complaints, interview, documents, OCR, completion) is accepted without persisted, versioned, timestamped `ACCEPTED` consent — 403 otherwise
- **File validation**: supported types only, magic-byte MIME check, 20 MB cap, ownership-verified access
- **Staff auth**: scrypt password hashing, hashed session tokens in `HttpOnly` cookies, expiry, logout, **in-memory login rate limit (8 attempts / 5 min per email)** — single-instance only; for multi-instance production, move rate limiting to a shared store (e.g. Redis)
- **Audit log**: INSERT-only; no UPDATE/DELETE paths

## Development

```bash
# 1. Dependencies
npm ci

# 2. Database (requires local PostgreSQL + sudo)
bash scripts/db-bootstrap.sh        # roles, DB, schema (idempotent), staff seed
DATABASE_URL="postgresql://medikiosk_owner:owner_local_dev@127.0.0.1:5432/medikiosk" \
  node scripts/seed-knowledge.mjs   # knowledge base: 13 documents / 17 chunks

# 3. App (env var for the app role connection)
DATABASE_URL="postgresql://medikiosk_app:medikiosk_local_dev@127.0.0.1:5432/medikiosk" npm run dev
```

Production: `npm run build && npx next start -p 3000`

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection (app role for the server; owner role for bootstrap/CLI scripts) |
| `SARVAM_API_KEY` | Voice (TTS/STT) provider — optional; absent = honest voice-unavailable states |

### Test commands

```bash
npm run lint            # ESLint
npx tsc --noEmit        # type check
npx vitest run          # unit/integration suite (32+ files)
npm run test:rls        # RLS / ownership regression against a live DB
npm run qa:responsive   # patient responsive QA: 6 languages x 5 widths (live server)
npm run build           # production build
```

### Demo workflow

1. Open `/patient` → choose a language → accept consent → describe a complaint (severity) → pick a body region on the diagram → add up to 2 extra complaints → answer the adaptive interview → optionally upload a prescription/lab PDF (OCR + structured evidence) → **Submit to doctor**.
2. Sign in at `/doctor` with the demo doctor account → the case appears in the queue → open it → review evidence, resolve contradictions, record Dashavidha observations, verify/reject evidence, run the consultation.
3. Sign in at `/hospital` with the demo hospital account → funnel, queue, document pipeline, and kiosk device network (send heartbeats via `POST /api/kiosk/heartbeat` to see a device appear).

Synthetic demo cases created with `demo: true` are visibly marked ("demo case" / "demo") in the Doctor and Hospital consoles.
