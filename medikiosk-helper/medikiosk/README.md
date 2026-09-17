# MediKiosk

MediKiosk is an independent, production-grade digital clinical intake and pre-consultation system. It connects patients to hospital operations by gathering structured medical histories, parsing medical documents, extracting evidence, and presenting a curated summary to the attending physician for final review.

## Architecture

MediKiosk relies on a central Postgres architecture (currently designed for Supabase) with three core operational consoles:

1. **Patient Console**: A privacy-first, accessible, multilingual interface where patients securely submit their chief complaints, severity, anatomical location, and medical documents.
2. **Doctor Console**: A clinical review workstation that consolidates the patient's structured history, safety signals, and AI-extracted evidence into a high-density, low-cognitive-load dashboard.
3. **Hospital Console**: An operational control center for managing queue status, patient throughput, kiosk health, and staff assignments.

## Security & Privacy Model
- **Durable Sessions**: Sessions are server-authoritative, backed by PostgreSQL `patient_sessions`, with HttpOnly/Secure short-lived cookies.
- **Role-Level Security (RLS)**: Enforced directly at the database tier via PostgreSQL connection roles. Patient sessions cannot view each other. Hospital staff cannot view physician-level clinical PHI.
- **Offline Recovery**: WebCrypto-encrypted local persistence ensures that network interruptions do not cause data loss, but raw PHI never leaks into unencrypted `localStorage`.

## Advanced Clinical Features

- **Adaptive Interview**: Medi Assistant dynamically guides the patient through history-taking, mapping facts to clinical intent without assuming diagnosis.
- **OCR & Evidence Extraction**: Patient-uploaded documents are parsed (using Tesseract or equivalent pipelines) and structured information is extracted (e.g., medications, procedures, labs). All facts maintain provenance (Patient vs. Document vs. AI).
- **Contradiction System**: Discrepancies between patient statements and uploaded documents are preserved and highlighted for the physician to manually resolve.
- **AYUSH & Dashavidha**: Optionally gathers structured indicators mapped to canonical AYUSH practices.
- **RAG Knowledge Assistant**: Provides medical information strictly bounded by safe AI operational guidelines.
- **Multilingual & Voice Integration**: Fully supports 6 languages with Text-To-Speech (TTS) and Speech-To-Text (STT) capabilities.

## Environment Configuration

Production requires the following environment variables. Do not commit secrets.

- `DATABASE_URL`: Connection string to the operational PostgreSQL database. Must have the required application roles provisioned.
- `DATABASE_ADMIN_URL`: Superuser string (used strictly for running schema migrations, never exposed to runtime).
- `KIOSK_HEARTBEAT_SECRET`: High-entropy key required for kiosk heartbeat endpoints.
- `NEXT_PUBLIC_APP_NAME`: Application display name.
- `SARVAM_API_KEY`: Required if the Sarvam STT/TTS voice layer is activated.
- `GEMINI_API_KEY`: Required if AI/Extraction capabilities are utilized.
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Used if migrating to complete Supabase integration.

## Setup & Deployment

1. **Install dependencies:**
   ```bash
   npm ci
   ```
2. **Database Provisioning:**
   Ensure your PostgreSQL instance matches the schema. Start by executing migrations or `db:reconcile` (see `package.json` for helpers).
3. **Build & Run:**
   ```bash
   npm run build
   npm start
   ```

*Disclaimer: MediKiosk is not a diagnostic tool and does not replace physician judgment. All extracted evidence must be reviewed by the consulting practitioner.*
