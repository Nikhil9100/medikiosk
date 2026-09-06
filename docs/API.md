# MediKiosk API Contracts

## Phase 2 session endpoints

### `POST /api/patient/session`

Creates or replays an owned patient session. Requires a Supabase-authenticated request and an `Idempotency-Key` header. The request body accepts only the validated `language` field. The response contains the safe session projection and sets an HTTP-only `medikiosk_session` cookie.

Repeated requests with the same idempotency key and owner return the existing session rather than creating a duplicate. The database unique index is the final retry/double-submit guard.

### `GET /api/patient/session`

Reads the session referenced by the HTTP-only cookie through the authenticated Supabase server client. The database RLS policy and owner identity both constrain access. Expired active sessions are marked `EXPIRED` and return HTTP 410.

### `PATCH /api/patient/session`

Accepts only the explicit update schema:

- `language`: one of `en`, `hi`, `bn`, `te`, `ta`, `mr`
- `consentStatus`: `NOT_REVIEWED`, `ACCEPTED`, or `DECLINED`
- `workflowStep`: `welcome`, `language`, `consent`, `start`, `complaint`, `anatomy`, or `interview`
- `complaintText`: optional patient complaint text (max 2000 chars)
- `bodyRegion`: optional body region enum value
- `bodySubregion`: optional body subregion enum value
- `interviewData`: optional record of interview facts keyed by question ID
- `status`: only `COMPLETED` is accepted as a terminal transition

Consent acceptance/decline records a fixed consent version and timestamp. Arbitrary columns, owner changes, and status reactivation are rejected. Interview facts are validated against `InterviewFactSchema` before persistence.

### `POST /api/patient/documents`

Uploads a medical document. Accepts `multipart/form-data` with a file and optional document type. The server validates the file via magic bytes and enforces a 20MB size limit. Supported formats: PDF, PNG, JPEG, WebP, BMP, TIFF.

Request body (form-data):
- `file`: file to upload
- `documentType` (optional): one of `PRESCRIPTION`, `LAB_REPORT`, `IMAGING`, `DISCHARGE_SUMMARY`, `VACCINATION`, `INSURANCE`, `OTHER`

Response:
- `id`: document UUID
- `sessionId`: associated session ID
- `documentType`: document type
- `status`: processing status
- `originalFilename`: original file name
- `mimeType`: validated MIME type
- `processingStatus`: current processing state
- `provenance`: `PATIENT`
- `ocrStatus`: OCR status
- `verificationStatus`: verification status
- `errors`: array of error messages
- `extractedFacts`: array of extracted facts (empty initially)
- `sourceReference`: optional page/section reference

### `GET /api/patient/documents`

Returns the list of documents for the current session.

Response:
- `documents`: array of document records

### `POST /api/patient/documents/[id]/ocr`

Starts OCR processing for a document. Validates session ownership and document ownership. Only documents with status `READY_FOR_OCR` or `FAILED` can be processed.

Request: empty body

Response:
- `status`: processing status after OCR
- `ocrStatus`: OCR completion status

Errors:
- `401`: Authentication required
- `404`: No active session or document not found
- `403`: Access denied (document does not belong to session)
- `409`: OCR already completed, in progress, or document not in valid state
- `410`: Document buffer not available (raw bytes were not persisted)
- `500`: OCR processing failed

### `GET /api/patient/documents/[id]/ocr`

Returns OCR status and results for a document.

Response:
- `id`: document UUID
- `ocrStatus`: OCR status
- `processingStatus`: processing status
- `ocrResults`: array of OCR result objects

OCR result object:
- `documentId`: document UUID
- `sessionId`: session UUID
- `pages`: array of page-level results
- `providerMetadata`: provider name, model, language, createdAt
- `handwritingDetected`: boolean (always `false` for Tesseract)
- `processingDurationMs`: optional processing time
- `createdAt`: ISO timestamp

Page result object:
- `pageNumber`: 1-based page index
- `extractedText`: extracted text content
- `confidence`: optional confidence score (0–1) when provided by engine
- `boundingBoxes`: optional bounding box data
- `language`: OCR language code used

Errors:
- `401`: Authentication required
- `404`: No active session or document not found
- `403`: Access denied

### `POST /api/patient/documents/[id]/ocr/retry`

Retries a failed OCR job. Only documents with `processingStatus: "FAILED"` can be retried.

Request: empty body

Response:
- `status`: processing status after retry
- `ocrStatus`: OCR completion status

Errors:
- `401`: Authentication required
- `404`: No active session or document not found
- `403`: Access denied
- `409`: Document is not in failed state
- `500`: OCR retry failed

### `POST /api/voice/transcribe`

Server-side speech-to-text endpoint. Accepts `multipart/form-data` with an audio file and a language code. The server maps the application language to the Sarvam BCP-47 code, forwards the audio to Sarvam Saaras v4, and returns the transcript. The API key is never exposed to the client.

Request body (form-data):
- `audio`: audio file (max 30 MB)
- `language`: one of `en`, `hi`, `bn`, `te`, `ta`, `mr`

Response:
- `transcript`: transcribed text
- `language`: mapped BCP-47 language code

### `POST /api/voice/speak`

Server-side text-to-speech endpoint. Accepts JSON with text and language code. The server forwards the request to Sarvam Bulbul v3 and returns base64-encoded audio.

Request body:
- `text`: string (1–2500 characters)
- `language`: one of `en`, `hi`, `bn`, `te`, `ta`, `mr`

Response:
- `audioBase64`: base64-encoded audio
- `contentType`: MIME type of the audio

### `POST /api/patient/session/reset`

Completes the current owned active session, clears the HTTP-only cookie, and returns `{ reset: true, session: null }`. The client idempotency key is removed only after the server reset succeeds.

## Authentication and persistence status

The API uses the Supabase SSR client and derives identity from `supabase.auth.getUser()`. The Phase 2 migration is in `supabase/migrations/20260906090000_create_patient_sessions.sql`. The Phase 4 schema migration is in `supabase/migrations/20260906121327_add_patient_intake_fields.sql`.

The configured Supabase project currently reports anonymous sign-ins disabled, and no Supabase CLI/database migration channel is installed in this workspace. The API therefore returns an honest authentication/configuration failure until the project is configured for the chosen patient identity flow and the migration is applied.