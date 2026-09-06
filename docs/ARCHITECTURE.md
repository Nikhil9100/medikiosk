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
The patient session contract is defined in `lib/session.ts` and exposed through `app/api/patient/session/route.ts`. It creates a random session identifier, records language, sets a 30-minute expiry, and issues an HTTP-only cookie. The route validates language with the shared patient language enum and returns an honest 400 response for invalid input.

Durable Supabase persistence, ownership authorization, recovery, and idempotent database writes remain blocked until the required Supabase URL and keys are configured. The current route does not pretend that an in-memory server process is durable clinical storage.

## Reasoning
The first phase must establish a real, testable foundation for healthcare intake. We avoid fake providers or fake patient data. The initial implementation keeps the architecture modular and deliberately separates clinical state, UI shell, and future provider integrations.
