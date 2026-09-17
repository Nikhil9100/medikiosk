# CHECKPUSH — MediKiosk release handoff

This file is the mandatory pre-push checklist for this release candidate. The package was rebuilt from the public `Nikhil9100/medikiosk` baseline at GitHub commit `39d82f23f6068db54e82e3601064b0d581e35b89` and then hardened as a standalone release candidate. **Do not delete this file before review.**

## What this release develops

### Patient Console
- Patient-friendly institutional kiosk UI with large touch targets, clear progress, accessible focus states and responsive layouts.
- Six-language workflow foundation: English, Hindi, Bengali, Telugu, Tamil and Marathi.
- Consent-first intake and explicit clinical-safety wording.
- Optional ABHA capture with `Continue without ABHA`; self-declared identifiers are minimized to last four digits / masked address and are never labelled VERIFIED without a real verification workflow.
- Complaint entry using touch or microphone; voice recording has stop/timeout/unmount cleanup.
- Body-area selection mirrored into the chief complaint so the Doctor Console receives the same clinical context.
- Up to four complaints with explicit severity.
- Adaptive interview preserving KNOWN / UNKNOWN / DECLINED / DENIED rather than converting missing information to “No”.
- Medical document upload with server-side magic-byte checks; PDF/PNG/JPEG/WebP/BMP/TIFF support contract.
- Explicit document processing workflow: upload → OCR → deterministic evidence extraction → physician review.
- Durable, idempotent “Submit to doctor” flow. Submission waits for genuinely active OCR/extraction jobs but allows failed/unavailable documents to proceed for manual physician review.
- Secure “New Patient” lifecycle handoff.
- **Medi** patient assistant with persisted conversation, separate Modern Medicine/Ayurveda retrieval, safety-first answers, microphone input, and Sarvam Bulbul v3 `priya` female TTS when configured. Text fallback remains available.

### Doctor Console
- Authenticated doctor-only clinical queue with urgent-first ordering, search, filters, severity, safety-signal and document visibility.
- Physician-ready case view containing complaints, structured interview, deterministic summary, documents/evidence/provenance/uncertainty, safety signals and patient/Medi conversation.
- Exact 10-part Dashavidha Atura Pariksha: Prakriti, Vikriti, Sara, Samhanana, Pramana, Satmya, Sattva, Ahara Shakti, Vyayama Shakti and Vaya. Missing observations remain NOT_ASSESSED and are never AI-inferred.
- Doctor notes and consultation start/complete actions with audit events.
- Optional identity status shown without exposing a full unverified ABHA number.
- Doctor-only FHIR R4 document Bundle export. It is explicitly labelled `ABDM_READY_PREVIEW`, with live ABDM connection and profile validation both false.

### Hospital Console
- Hospital-role operations command centre inspired by district-hospital / e-Hospital operating patterns without copying government branding or implying government ownership.
- Database-derived OPD/pre-consultation queue, urgent cases, in-consultation count, completed-today count and wait-time metric.
- Document / diagnostics-readiness pipeline.
- Kiosk heartbeat network with ONLINE / ATTENTION / OFFLINE state and interruption visibility.
- Staff-on-duty view and auditable operational event feed.
- Hospital role is intentionally separated from doctor-only clinical details.

### Security / data architecture
- Supabase-hosted PostgreSQL remains the canonical database.
- Server-issued HttpOnly cookies; Secure in production; SameSite=Lax.
- Least-privilege `medikiosk_app` production role expected.
- Forced PostgreSQL RLS on sensitive tables using transaction-scoped GUCs.
- Patient A / Patient B RLS regression script.
- Scrypt staff passwords, random session tokens stored as SHA-256 hashes, and database-backed shared login throttling keyed by hashed email.
- Security headers: nosniff, DENY framing, no-referrer, COOP/CORP, microphone-only Permissions Policy, HSTS, noindex.
- Clinical responses use private/no-store semantics where appropriate.
- Audit log for important patient/staff workflow actions.
- No secrets are included in this ZIP. `.env.example` contains names/placeholders only.

## Mandatory checks BEFORE GitHub push

Run from the project root in a normal network-enabled checkout:

```bash
npm install
npm run quality
npm run lint
npm run typecheck
npm test
npm run build
```

Then connect the real Supabase environment **without printing credentials**:

```bash
npm run db:preflight
npm run test:rls
```

For a legacy Supabase schema, take a database backup first. Then use the owner/admin connection only:

```bash
npm run db:reconcile
npm run db:preflight
npm run test:rls
```

Start the built application and run browser gates:

```bash
npm run qa:responsive
npm run qa:accessibility
npm run test:e2e
```

The full E2E script expects staff credentials through environment variables (`E2E_DOCTOR_EMAIL`, `E2E_DOCTOR_PASSWORD`, `E2E_HOSPITAL_EMAIL`, `E2E_HOSPITAL_PASSWORD`). Never hard-code them or paste them into GitHub.

## Production environment checklist

Required/conditional variables are documented in `.env.example`. Verify at least:
- `DATABASE_URL` points to the least-privileged Supabase Postgres application role. It must not be a superuser or BYPASSRLS role.
- `DATABASE_ADMIN_URL` exists only in controlled migration/maintenance environments; do not expose it to the browser.
- `SARVAM_API_KEY` is configured if voice STT/TTS is required for the SIH demo.
- Optional Supabase/Gemini variables are configured only if their corresponding code path is used.
- Vercel Production has the required environment variables. A green build alone does not prove runtime DB health.

## Manual functional review before submission

1. **Patient A:** fresh browser → session creation → language → consent → skip or self-declare ABHA → chief complaint → severity → body area → extra symptom → adaptive interview → optional document → OCR → extraction → submit → completion reference.
2. Refresh during several patient steps and confirm the durable server workflow resumes correctly.
3. Use Medi by typing and by microphone. Confirm STT produces the message and the answer can play using the configured Priya voice. Provider failure must show an honest unavailable state.
4. **Doctor:** sign in → Patient A appears in queue → case detail matches patient inputs → evidence remains unverified until doctor action → safety flags are not diagnoses → 10 Dashavidha items visible → note → start/complete consultation → FHIR export returns a real FHIR `Bundle`.
5. **Hospital:** sign in → real operational counters/queue/kiosk/staff/audit load; no hard-coded showcase metrics.
6. **Patient B:** choose New Patient, verify Patient A PHI does not flash or remain in patient UI, create Patient B, and run RLS regression to confirm cross-patient isolation.
7. Check 320, 360, 375, 390, 414, 768, 1024 and 1440 px layouts; no horizontal overflow or clipped controls.
8. Keyboard-only test: skip link, logical focus order, visible focus, labelled fields/buttons.

## Claims you must NOT make
- Do not call MediKiosk Government of India-owned, ministry-approved or government-certified.
- Do not display the Ashoka emblem or ministry seals without authorization.
- Do not call self-declared ABHA identity “verified”.
- Do not claim live ABDM/HIE-CM connectivity or ABDM certification. Current FHIR feature is an interoperability preview.
- Do not describe OCR/AI confidence as physician verification.
- Do not present Medi as a diagnostic or prescribing system.

## Git checks immediately before push

```bash
git status --short
git diff --check
git fetch origin
git log --oneline --decorate -5
git diff origin/main...HEAD
```

Review the entire diff and secret scan. Never force-push shared `main`. Prefer a same-repository release branch + PR when possible, then merge after CI passes. After push/merge, fetch again and verify the remote SHA actually contains the release files.

## Known external release gates

The ZIP is designed to be self-contained source code, but these checks require infrastructure that is intentionally not embedded in it:
- real Supabase credentials and live database state;
- a real Sarvam API key/provider response;
- network-installed npm dependencies / Playwright browsers if not already cached;
- Vercel production environment configuration;
- GitHub App/content-write access for autonomous remote push.

See `VERIFICATION.md` for the exact checks executed while this ZIP was assembled.

## Responsive UI release gate (mobile + laptop)

The release candidate includes dedicated responsive hardening for Patient, Doctor and Hospital consoles.

### Required viewport matrix
Run the app locally or against the deployment, then execute:

```bash
npm run qa:responsive
npm run qa:accessibility
```

`qa:responsive` checks these viewports:

- 320x568 — small phone
- 360x800 — Android phone
- 390x844 — modern phone
- 414x896 — large phone
- 768x1024 — tablet
- 1024x768 — tablet landscape / small laptop
- 1366x768 — common laptop
- 1440x900 — large laptop

Before pushing, confirm there is no page-level horizontal overflow, no clipped main/header/section/form container, and no visible interactive control smaller than the smoke-test threshold. Doctor and Hospital queue tables deliberately become stacked mobile cards at <=640px instead of requiring pinch-zoom or sideways reading. The full desktop tables remain on laptop widths.

### Manual responsive spot-check
Also manually inspect:

1. Patient top bar, language selector, Medi button and progress navigation at 320px.
2. Complaint, anatomy, symptoms, interview, documents and completion screens at 360/390px.
3. Medi assistant composer while the mobile keyboard is open.
4. Doctor queue cards at <=640px and full table at >=768px.
5. Doctor case evidence, urgent actions, FHIR action, notes and all 10 Dashavidha cards at 320/390/768/1366px.
6. Hospital queue, metrics, kiosk rows, staff rows and audit events at 320/390/768/1366px.
7. Doctor/Hospital login forms in portrait and landscape.
8. Long complaint text, long filenames and long audit identifiers do not force horizontal scrolling.
9. Rotate a phone between portrait and landscape once on Patient and Doctor views.
10. Verify browser zoom to 200% remains usable without losing actions/content.

Do not mark the release responsive-verified until these browser commands pass in an environment with Playwright installed.

## Approved Patient Console visual reference

The approved artwork is bundled at `docs/reference/patient-console-approved-reference.png`, with route-by-route mapping in `docs/PATIENT_UI_REFERENCE.md`. Before push, compare the running Patient Console against that reference at **390x844** and **1366x768** at minimum. The visual target is the same green/white institutional hierarchy, card treatment, step progress, touch controls, document cards, Medi presentation and success screen.

The implementation deliberately does not copy placeholder content that conflicts with the real product: the assistant remains **Medi** with Priya female voice, supported languages remain the real six-language set, structured history-taking remains present, and no government ownership/certification is implied.

## Documentation included in this ZIP

Before push/release review, use these files together:

- `DEVELOPMENT_SUMMARY.md` — what was developed.
- `SENIOR_QA_REPORT.md` — deep failure/resilience/security QA report.
- `VERIFICATION.md` — latest executed-vs-external verification state.
- `docs/PATIENT_UI_REFERENCE.md` — approved Patient Console reference mapping.
- `docs/PATIENT_UI_RETEST_REPORT.md` — Patient UI redesign retest evidence.
- `docs/ARCHITECTURE.md` — architecture/data/security structure.
- `docs/ABDM_INTEROPERABILITY.md` — honest FHIR/ABHA/ABDM boundary.
- `docs/SIH_READINESS.md` — SIH scope and external release gates.
- `DOCUMENT_INDEX.md` — index of all handoff documentation.
