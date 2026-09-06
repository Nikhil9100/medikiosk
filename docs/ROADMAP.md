# MediKiosk Roadmap

## Status legend
- DONE
- IN PROGRESS
- BLOCKED
- NOT STARTED

## Phase 0 — Architecture, repository, design system, infrastructure foundation
Goal: Create a stable product foundation and validation environment.
Scope: repo setup, stack choices, typed clinical model, responsive shell, docs.
Out of scope: live FHIR, production OCR, real AI calls, production auth, patient workflow, interview engine.
Implementation tasks:
- scaffold Next.js app
- establish TypeScript, lint, and test foundations
- define clinical provenance model
- create responsive product shell and design tokens
- document PRD and architecture
- validate environmental secret handling and provider boundaries
Tests: component tests, clinical-state tests, typecheck, lint, production build
Definition of Done: foundation compiles, tests pass, docs reflect reality, no secret exposure, responsive checks pass
Known limitations: no live Supabase, no production AI, no patient workflow, no full interview engine yet
Status: DONE

## Phase 1 — Responsive UI foundation + Patient Kiosk shell
Goal: Build mobile first patient workflow shell.
Scope: patient header, language selection, consent, welcome/start screens, progress, help, loading/error states, and accessible navigation.
Out of scope: clinical questions, patient persistence, dynamic branching engine, anatomy, voice, OCR, RAG, chatbot, doctor console, FHIR, and ABDM.
Tests: complete six-language dictionaries, workflow state, language persistence for all six languages, consent gate, back navigation, responsive browser checks.
Definition of Done: patient routes work with explicit consent, six initial language dictionaries are complete, responsive and accessibility checks pass, docs reflect the implementation.
Known limitations: workflow state is client-side only; language uses local storage; no clinical collection is present yet.
Phase completion: Implemented routes, shared patient shell, English/Hindi/Bengali/Telugu/Tamil/Marathi translations, consent gate, progress, help, loading/error state, focus styles, and responsive browser checks.
Status: DONE

## Phase 2 — Patient session + persistence + state integrity
Goal: Add server-side patient session handling and state isolation.
Implementation tasks:
- define typed session lifecycle and expiry
- issue secure HTTP-only session cookie
- add validated session API boundary
- connect durable Supabase persistence and ownership checks
Known limitations: durable persistence and cross-request session recovery are blocked until Supabase is configured; current endpoint is a boundary only and does not store clinical data.
Implemented: Supabase client boundaries, session migration, owner-based RLS policies, expiry-aware API, constrained updates, idempotency index, HTTP-only cookie, reset endpoint, and session lifecycle tests.
Verification: Typecheck, lint, tests, and production build pass. Migration policy checks pass statically. Live persistence/RLS testing and onboarding integration are blocked because the configured project has anonymous sign-ins disabled and no migration execution channel is installed.
Status: BLOCKED

## Phase 3 — Complaint collection + anatomy visualization
Goal: Support chief complaint and region selection.
Implemented: patient complaint capture, explicit empty-complaint handling, body-region selection, accessible button semantics, six-language copy coverage, and Phase 3 route integration without changing the established Phase 1/2 flow.
Verification: route tests and clinical validation pass; lint succeeds; production build succeeds in the current repository. Live Supabase persistence verification remains environment-limited by the local Docker/runtime state.
Status: DONE

## Phase 4 — Clinical interview engine + adaptive branching
Goal: Add deterministic questionnaire logic and branching.
Implemented: typed interview engine with 30+ questions across 8 domains, deterministic branching, explicit clinical states (NOT_ASKED, KNOWN, UNKNOWN, DECLINED, DENIED), provenance model, patient-friendly interview UI, six-language coverage, accessible controls, responsive behavior, and durable persistence through the session API.
Verification: interview engine tests (11), route tests (11), lint, build, and responsive QA pass.
Status: DONE

## Phase 5 — Sarvam voice
Goal: Connect patient voice workflow with provider abstraction.
Status: NOT STARTED

## Phase 6 — Documents + OCR + extraction
Goal: Add upload, OCR, and validation pipeline.
Status: NOT STARTED

## Phase 7 — Clinical summary + deterministic red flags + provenance
Goal: Summarize and flag safety-critical findings.
Status: NOT STARTED

## Phase 8 — Doctor Console
Goal: Build doctor review workspace.
Status: NOT STARTED

## Phase 9 — Ayurveda knowledge ingestion foundation
Goal: Start trusted content ingestion and metadata design.
Status: NOT STARTED

## Phase 10 — Ayurveda RAG
Goal: Ground Ayurveda queries with evidence and citations.
Status: NOT STARTED

## Phase 11 — Modern Medicine RAG
Goal: Add evidence retrieval for modern medicine.
Status: NOT STARTED

## Phase 12 — Medical Chatbot + RAG orchestration
Goal: Add role-aware grounded assistant.
Status: NOT STARTED

## Phase 13 — FHIR + ABDM
Goal: Build integration boundary and explicit status tracking.
Status: NOT STARTED

## Phase 14 — Security + production hardening
Goal: RLS, secure sessions, secrets, audit logging.
Status: NOT STARTED

## Phase 15 — E2E + cross-device + clinical safety QA
Goal: Validation across devices and failure states.
Status: NOT STARTED

## Phase 16 — Deployment + final audit
Goal: Production readiness review.
Status: NOT STARTED
