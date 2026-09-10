-- MediKiosk canonical schema (PostgreSQL 14+)
-- Idempotent: safe to re-run.
--
-- Roles:
--   medikiosk_owner : owns all objects, used only for DDL/bootstrap.
--   medikiosk_app   : application role. All DML runs as this role.
--                     ROW LEVEL SECURITY is FORCED on every sensitive table,
--                     so the application role can never read or write rows
--                     outside its scoped grant even if a query is malformed.
--
-- Row scoping is driven by per-transaction GUCs set by the server:
--   app.current_session : uuid of the active kiosk patient session (cookie-derived)
--   app.current_owner   : uuid owner of the session being created (server-generated)
--   app.kiosk_id        : text id of the kiosk device reporting a heartbeat
--   app.access_role     : 'staff' for authenticated doctor/hospital staff
--
-- Patient-scoped rows are visible to: the matching kiosk session, or staff.
-- Staff-only tables are visible to: staff only.
-- Kiosk heartbeat rows are visible to: staff, and writable by the matching kiosk device.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_session_id() RETURNS uuid AS $$
  SELECT nullif(current_setting('app.current_session', true), '')::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_access_role() RETURNS text AS $$
  SELECT current_setting('app.access_role', true)
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------------
-- Cases (patient sessions)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS patient_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_no integer UNIQUE,
  case_id text GENERATED ALWAYS AS ('CASE-' || (1000 + case_no)) STORED,
  owner_id uuid NOT NULL,
  idempotency_key text UNIQUE,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'EXPIRED', 'COMPLETED')),
  case_status text NOT NULL DEFAULT 'NEW'
    CHECK (case_status IN ('NEW', 'IN_PROGRESS', 'AWAITING_REVIEW', 'URGENT_REVIEW',
                           'IN_CONSULTATION', 'COMPLETED', 'CANCELLED')),
  language text NOT NULL DEFAULT 'en'
    CHECK (language IN ('en', 'hi', 'bn', 'te', 'ta', 'mr')),
  consent_status text NOT NULL DEFAULT 'NOT_REVIEWED'
    CHECK (consent_status IN ('NOT_REVIEWED', 'ACCEPTED', 'DECLINED')),
  consent_version text,
  consent_timestamp timestamptz,
  workflow_step text NOT NULL DEFAULT 'welcome'
    CHECK (workflow_step IN ('welcome', 'language', 'consent', 'start', 'complaint',
                             'anatomy', 'interview', 'documents', 'summary', 'complete')),
  -- Legacy single-complaint columns (superseded by the complaints table; kept
  -- for backward compatibility with the Supabase production schema).
  complaint_text text,
  body_region text,
  body_subregion text,
  interview_data jsonb,
  demo_flag boolean NOT NULL DEFAULT false,
  cancellation_reason text,
  summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_sessions_case_id ON patient_sessions (case_id);

DROP TRIGGER IF EXISTS trg_patient_sessions_updated ON patient_sessions;
CREATE TRIGGER trg_patient_sessions_updated BEFORE UPDATE ON patient_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Complaints (multiple, with severity + per-complaint HPI)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES patient_sessions(id) ON DELETE CASCADE,
  position integer NOT NULL,
  complaint_text text NOT NULL,
  body_region text,
  body_subregion text,
  severity text CHECK (severity IN ('MILD', 'MODERATE', 'SEVERE', 'VERY_SEVERE')),
  interview_data jsonb,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, position)
);

CREATE INDEX IF NOT EXISTS idx_complaints_session ON complaints (session_id);

DROP TRIGGER IF EXISTS trg_complaints_updated ON complaints;
CREATE TRIGGER trg_complaints_updated BEFORE UPDATE ON complaints
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Documents + OCR + extraction
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES patient_sessions(id) ON DELETE CASCADE,
  document_type text NOT NULL DEFAULT 'OTHER'
    CHECK (document_type IN ('PRESCRIPTION', 'LAB_REPORT', 'IMAGING', 'DISCHARGE_SUMMARY',
                             'VACCINATION', 'INSURANCE', 'OTHER')),
  status text NOT NULL DEFAULT 'RECEIVED',
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  file_size integer,
  page_count integer,
  content bytea,
  provenance text NOT NULL DEFAULT 'PATIENT',
  ocr_status text NOT NULL DEFAULT 'NOT_STARTED',
  extraction_status text NOT NULL DEFAULT 'NOT_STARTED',
  ai_provider_state text,
  failure_stage text,
  verification_status text NOT NULL DEFAULT 'UNVERIFIED',
  errors jsonb NOT NULL DEFAULT '[]',
  extracted_facts jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_session ON documents (session_id);

DROP TRIGGER IF EXISTS trg_documents_updated ON documents;
CREATE TRIGGER trg_documents_updated BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS ocr_results (
  id bigserial PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocr_results_document ON ocr_results (document_id);

CREATE TABLE IF NOT EXISTS document_extractions (
  id bigserial PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_extractions_document ON document_extractions (document_id);

DROP TRIGGER IF EXISTS trg_document_extractions_updated ON document_extractions;
CREATE TRIGGER trg_document_extractions_updated BEFORE UPDATE ON document_extractions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Clinical evidence (normalized extracted facts, reviewable by physicians)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clinical_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES patient_sessions(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  complaint_id uuid REFERENCES complaints(id) ON DELETE SET NULL,
  category text NOT NULL,
  normalized_value jsonb NOT NULL DEFAULT '{}',
  original_wording text,
  page_number integer,
  ocr_span jsonb,
  confidence numeric,
  extraction_method text NOT NULL DEFAULT 'DETERMINISTIC',
  provenance text NOT NULL DEFAULT 'OCR',
  provider jsonb,
  uncertainty_notes text,
  contradiction_group_id uuid,
  -- Patient review uses ACCEPTED; physician verification uses VERIFIED.
  -- They are distinct: patient acceptance never equals physician verification.
  verification_state text NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_state IN ('UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'ACCEPTED')),
  verified_by uuid,
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinical_evidence_session ON clinical_evidence (session_id);
CREATE INDEX IF NOT EXISTS idx_clinical_evidence_doc ON clinical_evidence (document_id);

DROP TRIGGER IF EXISTS trg_clinical_evidence_updated ON clinical_evidence;
CREATE TRIGGER trg_clinical_evidence_updated BEFORE UPDATE ON clinical_evidence
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Safety signals (deterministic red flags; never diagnoses)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS safety_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES patient_sessions(id) ON DELETE CASCADE,
  signal_type text NOT NULL,
  summary text NOT NULL,
  reason text NOT NULL,
  evidence_ref text,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'UNREVIEWED'
    CHECK (status IN ('UNREVIEWED', 'REVIEWED', 'ESCALATED', 'DISMISSED')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_signals_session ON safety_signals (session_id);

-- ---------------------------------------------------------------------------
-- Staff (doctors + hospital operations)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  title text,
  role text NOT NULL CHECK (role IN ('DOCTOR', 'HOSPITAL')),
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_sessions_staff ON staff_sessions (staff_id);

-- ---------------------------------------------------------------------------
-- Consultations + notes + AYUSH Dashavidha
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES patient_sessions(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES staff(id),
  status text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  note text
);

CREATE INDEX IF NOT EXISTS idx_consultations_session ON consultations (session_id);
CREATE INDEX IF NOT EXISTS idx_consultations_doctor ON consultations (doctor_id);

CREATE TABLE IF NOT EXISTS doctor_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES patient_sessions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES staff(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctor_notes_session ON doctor_notes (session_id);

-- AYUSH: Dashavidha Pariksha observations. Missing = NOT_ASSESSED (never inferred).
CREATE TABLE IF NOT EXISTS dashavidha_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES patient_sessions(id) ON DELETE CASCADE,
  observation text NOT NULL
    CHECK (observation IN ('shabda', 'roop', 'sparsha', 'purana',
                           'prakriti', 'vrikriti', 'vikriti', 'sthana')),
  value text,
  state text NOT NULL DEFAULT 'NOT_ASSESSED'
    CHECK (state IN ('NOT_ASSESSED', 'OBSERVED', 'NOT_APPLICABLE')),
  provenance text NOT NULL DEFAULT 'DOCTOR',
  recorded_by uuid REFERENCES staff(id),
  recorded_at timestamptz,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, observation)
);

DROP TRIGGER IF EXISTS trg_dashavidha_updated ON dashavidha_observations;
CREATE TRIGGER trg_dashavidha_updated BEFORE UPDATE ON dashavidha_observations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Kiosk device telemetry (heartbeat-driven health)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kiosk_heartbeats (
  kiosk_id text PRIMARY KEY,
  label text,
  last_seen timestamptz NOT NULL DEFAULT now(),
  active_session_id uuid,
  last_activity text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Assistant chat (patient-facing, visible to the assigned doctor)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES patient_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('PATIENT', 'ASSISTANT')),
  content text NOT NULL,
  intent text,
  citations jsonb,
  provider text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id);

-- ---------------------------------------------------------------------------
-- RAG knowledge bases (AYURVEDA / MODERN_MEDICINE, separate corpora)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corpus text NOT NULL CHECK (corpus IN ('AYURVEDA', 'MODERN_MEDICINE')),
  corpus_version text NOT NULL,
  title text NOT NULL,
  source text NOT NULL,
  author text,
  section text,
  year text,
  license text,
  language text NOT NULL DEFAULT 'en',
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_corpus ON knowledge_documents (corpus);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id bigserial PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  heading text,
  content text NOT NULL,
  search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(heading, '') || ' ' || content)) STORED,
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_fts ON knowledge_chunks USING gin (search_vector);

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  actor_type text NOT NULL CHECK (actor_type IN ('PATIENT', 'STAFF', 'SYSTEM')),
  actor_id uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at);

-- ---------------------------------------------------------------------------
-- Privileges: the app role may only do DML, never DDL.
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO medikiosk_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  patient_sessions, complaints, documents, ocr_results, document_extractions,
  clinical_evidence, safety_signals, staff, staff_sessions, consultations,
  doctor_notes, dashavidha_observations, kiosk_heartbeats, chat_messages,
  knowledge_documents, knowledge_chunks, audit_log
TO medikiosk_app;

GRANT USAGE, SELECT ON SEQUENCE ocr_results_id_seq, document_extractions_id_seq,
  knowledge_chunks_id_seq, audit_log_id_seq TO medikiosk_app;

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY (forced; no policy uses unrestricted USING (true))
-- ---------------------------------------------------------------------------

ALTER TABLE patient_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints FORCE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
ALTER TABLE ocr_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_results FORCE ROW LEVEL SECURITY;
ALTER TABLE document_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_extractions FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE safety_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_signals FORCE ROW LEVEL SECURITY;
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations FORCE ROW LEVEL SECURITY;
ALTER TABLE doctor_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE dashavidha_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashavidha_observations FORCE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff FORCE ROW LEVEL SECURITY;
ALTER TABLE staff_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE kiosk_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_heartbeats FORCE ROW LEVEL SECURITY;
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

-- Patient data: visible to the matching kiosk session or to staff.
DROP POLICY IF EXISTS patient_sessions_scope ON patient_sessions;
CREATE POLICY patient_sessions_scope ON patient_sessions
  USING (app_session_id() IS NOT NULL AND id = app_session_id()
         OR app_access_role() = 'staff'
         OR (app_access_role() IS DISTINCT FROM 'staff' AND app_session_id() IS NULL
             AND owner_id = nullif(current_setting('app.current_owner', true), '')::uuid))
  WITH CHECK (app_access_role() = 'staff'
         OR (app_session_id() IS NOT NULL AND id = app_session_id())
         OR (app_access_role() IS DISTINCT FROM 'staff' AND app_session_id() IS NULL
             AND owner_id = nullif(current_setting('app.current_owner', true), '')::uuid));

DROP POLICY IF EXISTS complaints_scope ON complaints;
CREATE POLICY complaints_scope ON complaints
  USING (app_session_id() IS NOT NULL AND session_id = app_session_id() OR app_access_role() = 'staff');

DROP POLICY IF EXISTS documents_scope ON documents;
CREATE POLICY documents_scope ON documents
  USING (app_session_id() IS NOT NULL AND session_id = app_session_id() OR app_access_role() = 'staff');

DROP POLICY IF EXISTS ocr_results_scope ON ocr_results;
CREATE POLICY ocr_results_scope ON ocr_results
  USING (app_session_id() IS NOT NULL AND session_id = app_session_id() OR app_access_role() = 'staff');

DROP POLICY IF EXISTS document_extractions_scope ON document_extractions;
CREATE POLICY document_extractions_scope ON document_extractions
  USING (app_session_id() IS NOT NULL AND session_id = app_session_id() OR app_access_role() = 'staff');

DROP POLICY IF EXISTS clinical_evidence_scope ON clinical_evidence;
CREATE POLICY clinical_evidence_scope ON clinical_evidence
  USING (app_session_id() IS NOT NULL AND session_id = app_session_id() OR app_access_role() = 'staff');

DROP POLICY IF EXISTS safety_signals_scope ON safety_signals;
CREATE POLICY safety_signals_scope ON safety_signals
  USING (app_session_id() IS NOT NULL AND session_id = app_session_id() OR app_access_role() = 'staff');

DROP POLICY IF EXISTS consultations_scope ON consultations;
CREATE POLICY consultations_scope ON consultations
  USING (app_session_id() IS NOT NULL AND session_id = app_session_id() OR app_access_role() = 'staff');

DROP POLICY IF EXISTS doctor_notes_scope ON doctor_notes;
CREATE POLICY doctor_notes_scope ON doctor_notes
  USING (app_session_id() IS NOT NULL AND session_id = app_session_id() OR app_access_role() = 'staff');

DROP POLICY IF EXISTS dashavidha_scope ON dashavidha_observations;
CREATE POLICY dashavidha_scope ON dashavidha_observations
  USING (app_session_id() IS NOT NULL AND session_id = app_session_id() OR app_access_role() = 'staff');

DROP POLICY IF EXISTS chat_messages_scope ON chat_messages;
CREATE POLICY chat_messages_scope ON chat_messages
  USING (app_session_id() IS NOT NULL AND session_id = app_session_id() OR app_access_role() = 'staff');

-- Staff tables: staff only.
DROP POLICY IF EXISTS staff_scope ON staff;
CREATE POLICY staff_scope ON staff
  USING (app_access_role() = 'staff') WITH CHECK (app_access_role() = 'staff');

DROP POLICY IF EXISTS staff_sessions_scope ON staff_sessions;
CREATE POLICY staff_sessions_scope ON staff_sessions
  USING (app_access_role() = 'staff') WITH CHECK (app_access_role() = 'staff');

-- Kiosk telemetry: staff can read; a kiosk device may insert/update only its own row.
DROP POLICY IF EXISTS kiosk_heartbeats_read ON kiosk_heartbeats;
CREATE POLICY kiosk_heartbeats_read ON kiosk_heartbeats
  FOR SELECT USING (app_access_role() = 'staff');

DROP POLICY IF EXISTS kiosk_heartbeats_write ON kiosk_heartbeats;
CREATE POLICY kiosk_heartbeats_write ON kiosk_heartbeats
  FOR INSERT WITH CHECK (nullif(current_setting('app.kiosk_id', true), '') IS NOT NULL
                         AND kiosk_id = nullif(current_setting('app.kiosk_id', true), ''));

DROP POLICY IF EXISTS kiosk_heartbeats_update ON kiosk_heartbeats;
CREATE POLICY kiosk_heartbeats_update ON kiosk_heartbeats
  FOR UPDATE USING (nullif(current_setting('app.kiosk_id', true), '') IS NOT NULL
                    AND kiosk_id = nullif(current_setting('app.kiosk_id', true), ''));

-- Knowledge base: staff can read (and the ingestion job, running as staff scope, can write).
DROP POLICY IF EXISTS knowledge_documents_read ON knowledge_documents;
CREATE POLICY knowledge_documents_read ON knowledge_documents
  USING (app_access_role() = 'staff');

DROP POLICY IF EXISTS knowledge_chunks_read ON knowledge_chunks;
CREATE POLICY knowledge_chunks_read ON knowledge_chunks
  USING (app_access_role() = 'staff');

-- Audit: staff reads; any authenticated scope may append (rows carry actor identity).
DROP POLICY IF EXISTS audit_log_read ON audit_log;
CREATE POLICY audit_log_read ON audit_log
  FOR SELECT USING (app_access_role() = 'staff');

DROP POLICY IF EXISTS audit_log_insert ON audit_log;
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT WITH CHECK (true);
