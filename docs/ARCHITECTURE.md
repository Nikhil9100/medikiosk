# MediKiosk Architecture Baseline

## Stack choice
- Next.js 16 App Router + TypeScript
- Tailwind CSS for responsive UI
- Zod for typed validation and clinical domain rules
- Vitest + Testing Library for component and domain tests
- Supabase PostgreSQL as the intended backend/database boundary
- Gemini as the planned LLM provider behind a provider abstraction
- Sarvam as the planned voice provider behind a provider abstraction

## Repository structure
- app/: application UI, routes, and shell screens
- lib/: shared domain logic and typed state validation
- docs/: product, architecture, clinical, security, roadmap, QA documentation
- public/: static assets
- vitest.config.ts: test configuration

## Major boundaries
1. Patient Kiosk UI
2. Doctor Console UI
3. Clinical Data Layer
4. Safety Layer
5. Voice Layer
6. Document/OCR Layer
7. AI Layer
8. RAG Layer
9. Security/Audit Layer

## Phase 2 session boundary
The durable session contract is defined in `lib/session.ts`, persisted by `supabase/migrations/20260906090000_create_patient_sessions.sql`, and exposed through `app/api/patient/session/route.ts` plus the reset route. The session stores Phase 2 fields and the patient-intake augmentation fields added for Phase 3: complaint text, selected body region, selected body subregion, lifecycle status, language, consent metadata, workflow step, timestamps, expiry, and idempotency key.

The server derives identity from `supabase.auth.getUser()`. The browser never sends an owner ID, and the database RLS policies require `owner_id = auth.uid()`. A unique `(owner_id, idempotency_key)` index handles duplicate create retries. The server checks expiry and rejects inactive sessions; status transitions only move from `ACTIVE` to `EXPIRED` or `COMPLETED`.

The repository is linked to a live Supabase project, but the local Docker API is not available in this environment, so live migration execution and database runtime verification remain environment-limited rather than code-blocked. The code path itself is structured and validated locally; production/live session verification depends on the target environment configuration.

## Phase 6A document intake
Medical documents are handled through a dedicated patient-facing upload flow integrated into the existing patient workflow. The document domain model (`lib/documents.ts`) defines typed schemas for documents, processing states, OCR status, verification status, and extracted facts with provenance.

The server-side API (`POST /api/patient/documents`) validates MIME types via magic bytes and enforces a 20MB size limit. Documents are tracked client-side with a processing state machine; no permanent object storage is introduced in Phase 6A. The OCR provider boundary is clean and deterministic, with test doubles only in tests.

## Phase 5 Sarvam voice
Voice is implemented as an optional input/output modality behind a server-side provider boundary. The browser never calls Sarvam directly. All voice requests go through MediKiosk server API routes (`POST /api/voice/transcribe` and `POST /api/voice/speak`), which validate payloads, enforce language mapping, and forward requests to Sarvam using the server-side `SARVAM_API_KEY`.

STT uses Saaras v4 (`model: saaras:v4`) with `mode: transcribe`. TTS uses Bulbul v3 (`model: bulbul:v3`) with a calm female speaker, pace 0.9, and 24000 Hz sample rate. The selected patient language is mapped to BCP-47 codes (e.g., `en` → `en-IN`) and sent explicitly; the system never silently switches the patient's language.

Voice transcripts are surfaced to the patient for review and edit before becoming clinical facts. Accepted voice answers are persisted with `VOICE` provenance, distinct from `PATIENT`, `AI`, or other sources. The deterministic interview engine remains the sole source of branching logic; voice does not duplicate or bypass it.

## Phase 4 clinical interview engine
The deterministic interview engine (`lib/interview-engine.ts`) provides a typed question bank with branching logic and explicit clinical states. The engine is persisted through the existing session API via the `interviewData` field. The live schema was synchronized with a forward-only migration (`supabase/migrations/20260906121327_add_patient_intake_fields.sql`) that added nullable columns for `complaint_text`, `body_region`, `body_subregion`, and `interview_data` (JSONB), and expanded the `workflow_step` constraint to include `complaint`, `anatomy`, and `interview`.

The interview UI (`app/patient/interview/page.tsx`) renders questions based on the current interview state, supports free text, yes/no, single choice, numeric, and date/duration inputs, and persists facts with `PATIENT` provenance by default. The engine never infers negative answers from UNKNOWN or DECLINED states.

## Reasoning
The first phase must establish a real, testable foundation for healthcare intake. We avoid fake providers or fake patient data. The initial implementation keeps the architecture modular and deliberately separates clinical state, UI shell, and future provider integrations.
