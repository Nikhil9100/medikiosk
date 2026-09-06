# Clinical Architecture

## Safety principles
- The AI does not become the final clinical authority.
- Deterministic safety review is preferred for red flags and escalation logic.
- Clinical facts keep explicit state and provenance metadata.
- Missing information is never treated as a negative fact.

## Fact model
Values should use a constrained set:
- KNOWN
- UNKNOWN
- NOT_ASKED
- DECLINED
- DENIED

Blank complaint text is valid as an explicit state of `NOT_ASKED`; it is never interpreted as a negative fact or as “no complaint.” The complaint question retains its textual prompt and provenance metadata in the patient workflow, and the patient source remains `PATIENT` unless a derived source is explicitly added.

Provenance should use:
- PATIENT
- VOICE
- TOUCH
- OCR
- AI
- DOCTOR
- SYSTEM

## Core workflow
1. patient provides or confirms symptoms
2. system stores fact with provenance
3. deterministic safety rules check red flags
4. doctor reviews summary and verifies facts
5. AI-generated content is labeled as review-required

## Red flag boundary
A red flag is a structured signal, not a diagnosis. It should trigger review, escalation, or re-interview logic but never autonomous treatment.
