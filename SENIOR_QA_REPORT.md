# MediKiosk — Senior QA Report

**Release scope:** Patient Console, Doctor Console, Hospital Console, resilience, privacy, security, interoperability preview and responsive UI.

**Final source-local verdict:** **PASS** for all executable gates in this packaging environment.

## Final automated result

| Gate | Result |
| --- | --- |
| Quality/security/source contract gate | **PASS — 53/53** |
| Automated Node regression suite | **PASS — 77/77** |
| TypeScript/TSX syntax-transpile sweep | **PASS** |
| Local import-resolution scan | **PASS** |
| Secret-pattern scan | **PASS** |
| Prototype/TODO runtime-source scan | **PASS** |
| ZIP integrity | rerun during final package assembly |

## Patient resilience / connection-loss testing

The release implements two independent recovery layers:

1. **Encrypted browser recovery** for safe text/workflow state and pending mutations.
2. **Server-side secure resume** using a high-entropy recovery secret whose hash is stored server-side and whose recovery lifetime is bounded.

Verified by automated tests:

- encrypted IndexedDB round-trip;
- non-extractable WebCrypto key;
- encrypted record does not expose patient plaintext;
- text draft survives recovery/reload;
- full ABHA values rejected from offline cache;
- file/blob/document binary data rejected from offline cache;
- nested sensitive/binary values cannot bypass guard;
- queued mutations replay oldest-first;
- same mutation ID is deduplicated;
- connection/network failure preserves queue;
- cookie/session loss requests secure resume instead of discarding work;
- validation conflicts preserve queued work for safe retry;
- expiry physically removes encrypted PHI;
- reset/submission purges recovery data and encryption key;
- queue capacity fails closed instead of deleting oldest patient work;
- older offline mutations flush before newer online writes;
- submitted cases cannot be re-cached as active PHI;
- completion cannot bypass pending offline mutations;
- document upload retry after response loss is idempotent;
- Medi chat retry after response loss is idempotent.

### Deliberately online-only data

The following are intentionally not cached as offline drafts:

- full ABHA identifier/address;
- uploaded medical-document binary contents;
- microphone/audio blobs;
- OCR provider jobs;
- final submission processing.

This is a privacy and clinical-integrity decision, not a missing feature.

## Patient Console testing

Passed contracts cover:

- approved Welcome + Language UI;
- privacy-first consent;
- optional ABHA and minimized identity handling;
- chief-complaint voice/text entry;
- severity + body-area screen;
- quick symptom selection;
- Medi guided interview;
- document upload/OCR/extraction states;
- female Medi voice contract and STT `transcript` response handling;
- completion and next-patient lifecycle;
- mobile/tablet/laptop responsive rules.

The approved design reference remains in `docs/reference/patient-console-approved-reference.png` and its implementation mapping is documented in `docs/PATIENT_UI_REFERENCE.md`.

## Doctor Console testing

Passed contracts cover:

- doctor-only queue access;
- urgent-first clinical workflow;
- clinical evidence/provenance visibility;
- physician Verify / Reject / Reset actions;
- safety Review / Escalate / Dismiss actions;
- failed note-save retains typed doctor note;
- unresolved urgent signals block consultation completion;
- canonical 10-part Dashavidha;
- doctor-only, no-store FHIR export.

## Hospital Console testing

Passed contracts cover:

- hospital-role authorization;
- real-data operations workspace contract;
- hospital overview excludes chief-complaint PHI;
- doctors/staff-on-duty requires unexpired staff sessions;
- production kiosk heartbeat fails closed without device authentication;
- operational rather than physician-level access boundary.

## Document/OCR/extraction testing

Passed contracts cover:

- upload retry deduplication after response loss;
- OCR claim/process/finalize architecture;
- OCR provider work is not performed inside the row-locking claim transaction;
- OCR retry replaces prior OCR result atomically;
- extraction protects concurrent replay;
- evidence generation is deduplicated;
- completion blocks genuinely in-flight document processing.

## Security/privacy testing

Passed contracts cover:

- forced PostgreSQL RLS schema;
- patient/staff cookies HttpOnly and Secure in production;
- DB-backed shared staff brute-force protection;
- hospital role gates;
- doctor FHIR role gate;
- server resume lookup security-definer search path is pinned;
- idempotent session retry is bound to matching resume-secret hash;
- production kiosk-heartbeat authentication uses fail-closed behavior;
- no Government of India ownership/certification implication in runtime UI;
- source secret-pattern scan.

## Responsive testing

Source/contract coverage confirms rules for:

- 320–414 px phones;
- 768 px tablet;
- 1024+ px laptop/desktop;
- Doctor/Hospital tables → mobile cards;
- clinical layouts collapse safely;
- patient forms and Medi composer avoid page-width overflow;
- safe-area and reduced-motion support.

The Playwright viewport matrix in the package covers:

- 320x568
- 360x800
- 390x844
- 414x896
- 768x1024
- 1024x768
- 1366x768
- 1440x900

## External tests still required before production/SIH deployment sign-off

These cannot be truthfully marked PASS in this sandbox because they require installed dependencies or user-controlled infrastructure:

- `npm ci` dependency installation;
- ESLint;
- framework-aware full TypeScript semantic check;
- Next.js production build;
- real Playwright browser responsive/accessibility/chaos test;
- live Supabase DB preflight and RLS Patient-A/Patient-B isolation test;
- real Sarvam microphone/STT/TTS call with valid key;
- live Patient → Doctor → Hospital end-to-end using provisioned staff credentials;
- Vercel production runtime smoke;
- GitHub remote push/SHA verification.

These are all enumerated in `CHECKPUSH.md`; none are falsely recorded as passed.

## QA conclusion

No source-local regression is currently failing. The release candidate passed **53/53 quality checks and 77/77 automated tests** in the final pre-package rerun. Infrastructure-dependent gates remain explicit mandatory pre-push/deployment checks.
