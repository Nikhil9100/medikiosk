// Shared helpers for route tests against the durable PostgreSQL backend.
// The routes' database boundaries are mocked at the module level:
//   - @/lib/db/pool                 (databaseConfigured, transactions)
//   - @/lib/db/session-scope        (getActiveKioskSession)
//   - @/lib/db/scoped-document-repo (scopedDocumentRepository)
// The in-memory DocumentRepository implementation doubles as the durable
// store, so state-machine and isolation assertions behave identically.

import { InMemoryDocumentRepository } from "@/lib/ocr/document-repository";
import type { CaseRecord } from "@/lib/db/cases";

export function makeFakeSession(overrides: Partial<CaseRecord> = {}): CaseRecord {
  const now = new Date();
  return {
    id: "session-123",
    caseNo: 1,
    caseId: "CASE-1001",
    ownerId: "owner-1",
    status: "ACTIVE",
    caseStatus: "IN_PROGRESS",
    language: "en",
    consentStatus: "ACCEPTED",
    consentVersion: "phase-2-v1",
    consentTimestamp: now,
    workflowStep: "documents",
    complaintText: null,
    bodyRegion: null,
    bodySubregion: null,
    interviewData: null,
    demoFlag: false,
    cancellationReason: null,
    summary: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
    completedAt: null,
    ...overrides,
  };
}

export function createTestDocStore(): InMemoryDocumentRepository {
  return new InMemoryDocumentRepository();
}
