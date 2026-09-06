# MediKiosk Roadmap

## Status legend
- DONE
- IN PROGRESS
- BLOCKED
- NOT STARTED

## Phase 0 — Architecture, repository, design system, infrastructure foundation
Goal: Create a stable product foundation and validation environment.
Scope: repo setup, stack choices, typed clinical model, responsive shell, docs.
Out of scope: live FHIR, production OCR, real AI calls, production auth.
Implementation tasks:
- scaffold Next.js app
- establish TypeScript and lint/test foundations
- define clinical provenance model
- create product shell and design tokens
- document PRD and architecture
Tests: component and clinical-state tests
Definition of Done: foundation compiles, tests pass, docs reflect reality
Known limitations: no live Supabase, no production AI, no full clinical interview engine yet
Status: DONE

## Phase 1 — Responsive UI foundation + Patient Kiosk shell
Goal: Build mobile first patient workflow shell.
Scope: patient layout, progress, and accessibility shell.
Out of scope: dynamic branching engine and OCR.
Status: IN PROGRESS

## Phase 2 — Patient session + persistence + state integrity
Goal: Add server-side patient session handling and state isolation.
Status: NOT STARTED

## Phase 3 — Complaint collection + anatomy visualization
Goal: Support chief complaint and region selection.
Status: NOT STARTED

## Phase 4 — Clinical interview engine + adaptive branching
Goal: Add deterministic questionnaire logic and branching.
Status: NOT STARTED

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
