/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetAuthenticatedStaff, fakeClient } = vi.hoisted(() => ({
  mockGetAuthenticatedStaff: vi.fn(),
  fakeClient: { query: vi.fn(async () => ({ rows: [] })) },
}));

vi.mock("@/lib/staff-auth", () => ({
  getAuthenticatedStaff: mockGetAuthenticatedStaff,
}));

vi.mock("@/lib/db/pool", () => ({
  databaseConfigured: () => true,
  withStaffTx: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => fn(fakeClient)),
  withKioskTx: vi.fn(async (id: string, fn: (c: unknown) => Promise<unknown>) => fn(fakeClient)),
}));

vi.mock("@/lib/db/cases", () => ({
  getFunnelCounts: vi.fn(async () => ({ kiosk_intake: 0, pre_consultation: 0, document_processing: 0, doctor_queue: 0, consultation: 0, completed: 0, avg_wait_minutes: 0 })),
  listQueueCases: vi.fn(async () => []),
}));
vi.mock("@/lib/db/kiosk", () => ({
  listKiosks: vi.fn(async () => []),
  clearInterruptedSession: vi.fn(async () => true),
}));
vi.mock("@/lib/db/complaints", () => ({
  listComplaints: vi.fn(async () => []),
}));
vi.mock("@/lib/db/documents-pg", () => ({
  listEvidenceForSession: vi.fn(async () => []),
}));
vi.mock("@/lib/clinical-summary", () => ({
  INTERVIEW_DOMAINS: [],
}));
vi.mock("@/lib/db/audit", () => ({
  writeAudit: vi.fn(async () => {}),
}));

import { GET as hospitalOverview } from "../hospital/overview/route";
import { GET as queue } from "./queue/route";
import { GET as caseGet } from "./case/[sessionId]/route";
import { PATCH as dashavidha } from "./case/[sessionId]/dashavidha/route";
import { POST as notes } from "./case/[sessionId]/notes/route";
import { PATCH as signal } from "./case/[sessionId]/signals/[signalId]/route";
import { PATCH as verifyEvidence } from "./case/[sessionId]/evidence/[evidenceId]/route";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const DOCTOR = { id: "doc-1", email: "doctor@medikiosk.local", display_name: "Dr", title: "MD", role: "DOCTOR" };
const HOSPITAL = { id: "hos-1", email: "hospital@medikiosk.local", display_name: "Ops", title: "Lead", role: "HOSPITAL" };

function req(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/x", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeClient.query.mockClear();
});

describe("hospital overview authorization (§4 regression)", () => {
  it("anonymous -> 401", async () => {
    mockGetAuthenticatedStaff.mockResolvedValue(null);
    const res = await hospitalOverview();
    expect(res.status).toBe(401);
  });

  it("authenticated DOCTOR -> 403 (role required server-side)", async () => {
    mockGetAuthenticatedStaff.mockResolvedValue(DOCTOR);
    const res = await hospitalOverview();
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toMatch(/hospital/i);
  });

  it("authenticated HOSPITAL -> 200 with overview payload", async () => {
    mockGetAuthenticatedStaff.mockResolvedValue(HOSPITAL);
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM documents")) {
        return { rows: [{ uploaded: 0, ocr_processing: 0, ocr_complete: 0, extraction_processing: 0, awaiting_review: 0, failed: 0 }] };
      }
      if (sql.includes("FROM staff")) return { rows: [] };
      return { rows: [{ n: 0 }] };
    });
    const res = await hospitalOverview();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.overview).toBeDefined();
    expect(Array.isArray(data.overview.cases)).toBe(true);
  });
});

describe("physician-only staff routes reject non-DOCTOR roles (§5)", () => {
  it("queue: anonymous 401, hospital 403, doctor allowed", async () => {
    mockGetAuthenticatedStaff.mockResolvedValue(null);
    expect((await queue()).status).toBe(401);
    mockGetAuthenticatedStaff.mockResolvedValue(HOSPITAL);
    expect((await queue()).status).toBe(403);
    mockGetAuthenticatedStaff.mockResolvedValue(DOCTOR);
    const ok = await queue();
    expect(ok.status).not.toBe(401);
    expect(ok.status).not.toBe(403);
  });

  it("case bundle GET: hospital 403, doctor not role-rejected", async () => {
    mockGetAuthenticatedStaff.mockResolvedValue(HOSPITAL);
    const denied = await caseGet(req("GET"), { params: Promise.resolve({ sessionId: SESSION_ID }) });
    expect(denied.status).toBe(403);
    mockGetAuthenticatedStaff.mockResolvedValue(DOCTOR);
    const allowed = await caseGet(req("GET"), { params: Promise.resolve({ sessionId: SESSION_ID }) });
    expect(allowed.status).not.toBe(403);
    expect(allowed.status).not.toBe(401);
  });

  it("dashavidha PATCH: hospital 403, doctor not role-rejected", async () => {
    const body = { observation: "prakriti", state: "NOT_ASSESSED" };
    mockGetAuthenticatedStaff.mockResolvedValue(HOSPITAL);
    const denied = await dashavidha(req("PATCH", body), { params: Promise.resolve({ sessionId: SESSION_ID }) });
    expect(denied.status).toBe(403);
    mockGetAuthenticatedStaff.mockResolvedValue(null);
    expect((await dashavidha(req("PATCH", body), { params: Promise.resolve({ sessionId: SESSION_ID }) })).status).toBe(401);
    mockGetAuthenticatedStaff.mockResolvedValue(DOCTOR);
    const allowed = await dashavidha(req("PATCH", body), { params: Promise.resolve({ sessionId: SESSION_ID }) });
    expect(allowed.status).not.toBe(403);
    expect(allowed.status).not.toBe(401);
  });

  it("doctor notes POST: hospital 403, doctor not role-rejected", async () => {
    const body = { note: "Reviewed history." };
    mockGetAuthenticatedStaff.mockResolvedValue(HOSPITAL);
    const denied = await notes(req("POST", body), { params: Promise.resolve({ sessionId: SESSION_ID }) });
    expect(denied.status).toBe(403);
    mockGetAuthenticatedStaff.mockResolvedValue(DOCTOR);
    const allowed = await notes(req("POST", body), { params: Promise.resolve({ sessionId: SESSION_ID }) });
    expect(allowed.status).not.toBe(403);
    expect(allowed.status).not.toBe(401);
  });

  it("safety signal PATCH: hospital 403, doctor not role-rejected", async () => {
    const body = { action: "REVIEWED" };
    mockGetAuthenticatedStaff.mockResolvedValue(HOSPITAL);
    const denied = await signal(req("PATCH", body), {
      params: Promise.resolve({ sessionId: SESSION_ID, signalId: "22222222-2222-4222-8222-222222222222" }),
    });
    expect(denied.status).toBe(403);
    mockGetAuthenticatedStaff.mockResolvedValue(DOCTOR);
    const allowed = await signal(req("PATCH", body), {
      params: Promise.resolve({ sessionId: SESSION_ID, signalId: "22222222-2222-4222-8222-222222222222" }),
    });
    expect(allowed.status).not.toBe(403);
    expect(allowed.status).not.toBe(401);
  });
});

describe("staff case routes reject malformed IDs with 404, never 500 (honest failure)", () => {
  it("case bundle GET: 'undefined' sessionId -> 404 before any DB access", async () => {
    mockGetAuthenticatedStaff.mockResolvedValue(DOCTOR);
    const res = await caseGet(req("GET"), { params: Promise.resolve({ sessionId: "undefined" }) });
    expect(res.status).toBe(404);
    expect(fakeClient.query).not.toHaveBeenCalled();
  });

  it("dashavidha POST: malformed sessionId -> 404", async () => {
    mockGetAuthenticatedStaff.mockResolvedValue(DOCTOR);
    const res = await dashavidha(req("POST", { observations: [] }), { params: Promise.resolve({ sessionId: "not-a-uuid" }) });
    expect(res.status).toBe(404);
    expect(fakeClient.query).not.toHaveBeenCalled();
  });

  it("evidence verify PATCH: malformed ids -> 404", async () => {
    mockGetAuthenticatedStaff.mockResolvedValue(DOCTOR);
    const res = await verifyEvidence(req("PATCH", { state: "VERIFIED" }), {
      params: Promise.resolve({ sessionId: "undefined", evidenceId: "undefined" }),
    });
    expect(res.status).toBe(404);
  });
});
