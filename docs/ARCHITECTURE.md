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

## Phase 4 clinical interview engine
The deterministic interview engine (`lib/interview-engine.ts`) provides a typed question bank with branching logic and explicit clinical states. The engine is persisted through the existing session API via the `interviewData` field. The live schema was synchronized with a forward-only migration (`supabase/migrations/20260906121327_add_patient_intake_fields.sql`) that added nullable columns for `complaint_text`, `body_region`, `body_subregion`, and `interview_data` (JSONB), and expanded the `workflow_step` constraint to include `complaint`, `anatomy`, and `interview`.

The interview UI (`app/patient/interview/page.tsx`) renders questions based on the current interview state, supports free text, yes/no, single choice, numeric, and date/duration inputs, and persists facts with `PATIENT` provenance by default. The engine never infers negative answers from UNKNOWN or DECLINED states.

## Reasoning
The first phase must establish a real, testable foundation for healthcare intake. We avoid fake providers or fake patient data. The initial implementation keeps the architecture modular and deliberately separates clinical state, UI shell, and future provider integrations.
