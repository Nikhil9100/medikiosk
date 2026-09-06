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
The durable session contract is defined in `lib/session.ts`, persisted by `supabase/migrations/20260906090000_create_patient_sessions.sql`, and exposed through `app/api/patient/session/route.ts` plus the reset route. The session stores only Phase 2 fields: owner identity, lifecycle status, language, consent metadata, workflow step, timestamps, expiry, and idempotency key.

The server derives identity from `supabase.auth.getUser()`. The browser never sends an owner ID, and the database RLS policies require `owner_id = auth.uid()`. A unique `(owner_id, idempotency_key)` index handles duplicate create retries. The server checks expiry and rejects inactive sessions; status transitions only move from `ACTIVE` to `EXPIRED` or `COMPLETED`.

The configured project is reachable for Auth, but anonymous sign-ins are currently disabled and no migration execution channel is installed locally. Patient onboarding integration and live RLS tests remain blocked until the chosen patient authentication mode is enabled and the migration is applied to the configured project.

## Reasoning
The first phase must establish a real, testable foundation for healthcare intake. We avoid fake providers or fake patient data. The initial implementation keeps the architecture modular and deliberately separates clinical state, UI shell, and future provider integrations.
