# MediKiosk — Digital Clinical History & Pre-Consultation System

MediKiosk is an independent SIH 2026 healthcare prototype for problem statement **SIH26047**. It provides one canonical Patient → Doctor → Hospital data flow backed by Supabase-hosted PostgreSQL.

## Consoles

- **Patient Console** — multilingual consent-first kiosk, optional ABHA capture, complaint + anatomy + multiple symptoms, adaptive interview, document upload/OCR/extraction, safety escalation, and **Medi** (female-voice patient assistant using Sarvam `priya`).
- **Doctor Console** — urgent-first live queue, physician-ready case bundle, provenance-aware evidence, safety review, 10-part Dashavidha Atura Pariksha, notes, consultation lifecycle and FHIR R4 export.
- **Hospital Console** — district-hospital-style pre-consultation operations view: OPD intake funnel, urgent review load, document pipeline, doctor workload, kiosk health and auditable events. All displayed values come from the same database; no fake statistics.

## Clinical boundaries

MediKiosk is **not an autonomous doctor**. It does not independently diagnose or prescribe. OCR/AI output remains unverified evidence until a physician reviews it. Unknown information is preserved as unknown. The two knowledge corpora (Modern Medicine and Ayurveda) remain separate from patient facts.

## ABDM / ABHA / FHIR

ABHA is optional. Self-declared ABHA information is clearly marked unverified and is privacy-minimised. The FHIR endpoint is an **ABDM-ready preview**, not a claim of live ABDM connection, certification or conformance testing.

## Database

The canonical runtime database is Supabase-hosted PostgreSQL through `DATABASE_URL` using a least-privileged application role. Row-level security is forced on sensitive tables and scoped through server-set transaction GUCs. `DATABASE_ADMIN_URL` is reserved for controlled migrations/preflight.

## Local setup

1. Copy `.env.example` to `.env.local` and fill secrets locally. Never commit it.
2. Install dependencies with `npm ci` (or `npm install` when regenerating a lockfile).
3. Run `npm run db:preflight` against the target Supabase database.
4. Apply `db/schema.sql` / migrations using an owner connection.
5. Run `npm run quality`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
6. With a configured database and app server, run RLS, accessibility, responsive and E2E release gates.

See **CHECKPUSH.md** before pushing to GitHub.
