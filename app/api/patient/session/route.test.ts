/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/pool", () => ({
  databaseConfigured: vi.fn(() => true),
  withKioskTx: vi.fn(),
  withNewSessionTx: vi.fn((_id: string, fn: (c: unknown) => unknown) => fn({})),
}));
vi.mock("@/lib/db/cases", () => ({
  getCase: vi.fn(),
  createCase: vi.fn(),
  updateCase: vi.fn(),
}));
vi.mock("@/lib/db/documents-pg", () => ({
  PostgresDocumentRepository: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { cookies } from "next/headers";
import { withKioskTx } from "@/lib/db/pool";
import { getCase, updateCase } from "@/lib/db/cases";
import { PostgresDocumentRepository } from "@/lib/db/documents-pg";
import { GET, PATCH } from "./route";

const now = new Date();
const ACTIVE_SESSION = {
  id: "11111111-1111-4111-8111-111111111111",
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
  complaintText: "headache",
  bodyRegion: "head",
  bodySubregion: null,
  interviewData: null,
  demoFlag: false,
  cancellationReason: null,
  summary: null,
  createdAt: now,
  updatedAt: now,
  expiresAt: new Date(now.getTime() + 3600_000),
  completedAt: null,
};

const DOC = {
  id: "doc-1",
  sessionId: "session-123",
  documentType: "PRESCRIPTION",
  originalFilename: "rx.pdf",
  mimeType: "application/pdf",
  createdAt: now.toISOString(),
  receivedAt: now.toISOString(),
  updatedAt: now.toISOString(),
  processingStatus: "OCR_COMPLETE",
  provenance: "PATIENT",
  ocrStatus: "COMPLETED",
  extractionStatus: "COMPLETED",
  verificationStatus: "UNVERIFIED",
  errors: [],
  extractedFacts: [],
  ocrResults: [],
};

function setup(session: any, documents: any[] = [DOC]) {
  vi.mocked(cookies).mockResolvedValue({ get: () => ({ name: "medikiosk_session", value: "session-123" }) }) as any;
  vi.mocked(getCase).mockResolvedValue(session);
  vi.mocked(withKioskTx).mockImplementation(async (_id: string, fn: (c: unknown) => Promise<unknown>) =>
    // Emulate the route: first tx = load (getCase + documents), second = expiry update.
    Promise.resolve(fn({})),
  ) as any;
  vi.mocked(PostgresDocumentRepository).mockImplementation(() => ({
    getSessionDocumentsWithOcr: vi.fn().mockResolvedValue(documents),
  })) as any;
}

describe("GET /api/patient/session (documents rehydration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes the session's documents (with OCR) so a refresh rehydrates them", async () => {
    setup(ACTIVE_SESSION);
    const response = await GET();
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.session.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(data.session.documents).toHaveLength(1);
    expect(data.session.documents[0].id).toBe("doc-1");
    expect(data.session.documents[0].processingStatus).toBe("OCR_COMPLETE");
    expect(data.session.documents[0].ocrStatus).toBe("COMPLETED");
  });

  it("includes an empty documents array when the session has none", async () => {
    setup(ACTIVE_SESSION, []);
    const response = await GET();
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.session.documents).toEqual([]);
  });

  it("returns 410 for an expired session and no documents", async () => {
    setup({ ...ACTIVE_SESSION, status: "EXPIRED", expiresAt: new Date(now.getTime() - 1000) });
    const response = await GET();
    const data = await response.json();
    expect(response.status).toBe(410);
    expect(data.session).toBeUndefined();
  });

  it("returns 404 when the session does not exist", async () => {
    setup(null);
    const response = await GET();
    expect(response.status).toBe(404);
  });
});

// Consent gate: no clinical write before ACCEPTED (server-side enforcement).
describe("PATCH /api/patient/session (consent gate)", () => {
  const NOT_REVIEWED = {
    ...ACTIVE_SESSION,
    consentStatus: "NOT_REVIEWED",
    consentVersion: null,
    consentTimestamp: null,
    workflowStep: "welcome",
    complaintText: null,
  };

  function setupPatch(current: any, updated: any) {
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ name: "medikiosk_session", value: "session-123" }) }) as any;
    vi.mocked(getCase).mockResolvedValue(current);
    vi.mocked(updateCase).mockResolvedValue(updated);
    vi.mocked(withKioskTx).mockImplementation(async (_id: string, fn: (c: unknown) => Promise<unknown>) =>
      Promise.resolve(fn({})),
    ) as any;
  }

  function patchRequest(body: unknown) {
    return new Request("http://localhost/api/patient/session", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("refuses workflow advancement to a post-consent step without consent (403)", async () => {
    setupPatch(NOT_REVIEWED, NOT_REVIEWED);
    const response = await PATCH(patchRequest({ workflowStep: "complaint" }));
    const data = await response.json();
    expect(response.status).toBe(403);
    expect(data.code).toBe("CONSENT_REQUIRED");
  });

  it("refuses recording complaint text without consent (403)", async () => {
    setupPatch(NOT_REVIEWED, NOT_REVIEWED);
    const response = await PATCH(patchRequest({ complaintText: "headache" }));
    expect(response.status).toBe(403);
  });

  it("refuses recording interview data without consent (403)", async () => {
    setupPatch(NOT_REVIEWED, NOT_REVIEWED);
    const response = await PATCH(patchRequest({ interviewData: { q1: "UNKNOWN" } }));
    expect(response.status).toBe(403);
  });

  it("still allows the consent screen and language choice without consent", async () => {
    setupPatch(NOT_REVIEWED, { ...NOT_REVIEWED, workflowStep: "consent", language: "hi" });
    const response = await PATCH(patchRequest({ workflowStep: "consent", language: "hi" }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.session.workflowStep).toBe("consent");
  });

  it("accepts consent and advances the step in one update", async () => {
    setupPatch(NOT_REVIEWED, { ...NOT_REVIEWED, consentStatus: "ACCEPTED", workflowStep: "start" });
    const response = await PATCH(patchRequest({ consentStatus: "ACCEPTED", workflowStep: "start" }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.session.consentStatus).toBe("ACCEPTED");
  });

  it("allows workflow advancement after consent is accepted", async () => {
    setupPatch(ACTIVE_SESSION, { ...ACTIVE_SESSION, workflowStep: "complaint" });
    const response = await PATCH(patchRequest({ workflowStep: "complaint" }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.session.workflowStep).toBe("complaint");
  });
});
