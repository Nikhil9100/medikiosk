# Clinical Architecture

## Safety principles
- The AI does not become the final clinical authority.
- Deterministic safety review is preferred for red flags and escalation logic.
- Clinical facts keep explicit state and provenance metadata.
- Missing information is never treated as a negative fact.
- UNKNOWN or DECLINED responses do not trigger negative branch assumptions.
- AI-generated clinical facts must carry explicit `AI` provenance.

## Fact model
Values should use a constrained set:
- NOT_ASKED
- KNOWN
- UNKNOWN
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

## Voice provenance
Voice input is an alternative input modality, not a separate diagnostic system. Voice-derived facts must carry `VOICE` provenance and must never be silently relabeled as `PATIENT` or `AI`. The patient reviews and edits every transcript before it becomes a clinical fact. If the transcript is unclear or confidence is insufficient, the engine preserves `UNKNOWN`, `NOT_ASKED`, or `DECLINED` semantics; it never infers or fabricates symptoms.

## Interview engine
The Phase 4 interview engine provides a deterministic, typed question bank with branching logic.

### Question domains
- presenting_complaint
- past_history
- surgery_history
- medication_history
- allergy_history
- family_history
- personal_social_history
- review_of_systems

### Branching rules
- Surgery yes → surgery follow-up (surgery_details)
- Medication yes → medication details
- Allergy yes → allergen/reaction details
- Tobacco yes → usage follow-up
- Explicit symptom present → relevant follow-up
- UNKNOWN or DECLINED must not trigger a negative branch; the same question is re-presented.

### Answer states
- KNOWN: patient provided a substantive answer
- DENIED: patient explicitly answered "no" or equivalent
- UNKNOWN: patient indicated they do not know
- DECLINED: patient preferred not to answer

### Persistence
Interview facts are stored in `patient_sessions.interview_data` as JSONB. Each fact includes:
- questionId
- value (optional string)
- state (ClinicalAnswerState)
- provenance (ClinicalProvenance)

Facts are persisted through the existing session PATCH API using the `interviewData` field.

## Core workflow
1. patient provides or confirms symptoms
2. system stores fact with provenance
3. deterministic safety rules check red flags
4. doctor reviews summary and verifies facts
5. AI-generated content is labeled as review-required

## Red flag boundary
A red flag is a structured signal, not a diagnosis. It should trigger review, escalation, or re-interview logic but never autonomous treatment.
