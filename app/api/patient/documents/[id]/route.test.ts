/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/pool", () => ({
  databaseConfigured: vi.fn(() => true),
  withKioskTx: vi.fn((_id: string, fn: (c: unknown) => unknown) => fn({})),
}));
vi.mock("@/lib/db/session-scope", () => ({
  getActiveKioskSession: vi.fn(),
}));
vi.mock("@/lib/db/scoped-document-repository", () => ({
  scopedDocumentRepository: vi.fn(),
}));

import { getActiveKioskSession } from "@/lib/db/session-scope";
import { scopedDocumentRepository } from "@/lib/db/scoped-document-repository";
import { DELETE } from "./route";
import { makeFakeSession } from "../../../../../test/db-mocks";

const mockRepo = {
  findById: vi.fn(),
  delete: vi.fn(),
};

const DOC = {
  id: "doc-123",
  sessionId: "session-123",
  originalFilename: "rx.pdf",
};

function setup(sessionId: string | null, doc: any = DOC) {
  vi.mocked(getActiveKioskSession).mockResolvedValue(sessionId ? makeFakeSession({ id: sessionId }) : null);
  vi.mocked(scopedDocumentRepository).mockReturnValue(mockRepo);
  vi.mocked(mockRepo.findById).mockResolvedValue(doc);
}

const req = () => new Request("http://localhost/api/patient/documents/doc-123", { method: "DELETE" });
const params = { params: Promise.resolve({ id: "doc-123" }) };

describe("DELETE /api/patient/documents/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup("session-123");
  });

  it("deletes the document for the owner and reports success", async () => {
    vi.mocked(mockRepo.delete).mockResolvedValue(true);

    const response = await DELETE(req(), params);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ deleted: true, id: "doc-123" });
    expect(mockRepo.delete).toHaveBeenCalledWith("doc-123");
  });

  it("returns 404 when no session is active", async () => {
    setup(null);
    const response = await DELETE(req(), params);
    expect(response.status).toBe(404);
    expect(mockRepo.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when the document does not exist", async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(null);
    const response = await DELETE(req(), params);
    expect(response.status).toBe(404);
    expect(mockRepo.delete).not.toHaveBeenCalled();
  });

  it("denies cross-session deletion (403) and deletes nothing", async () => {
    // Caller's session is session-123; the document belongs to someone else.
    vi.mocked(mockRepo.findById).mockResolvedValue({ ...DOC, sessionId: "session-other" });
    const response = await DELETE(req(), params);
    expect(response.status).toBe(403);
    expect(mockRepo.delete).not.toHaveBeenCalled();
  });

  it("returns 404 if the delete does not match a row", async () => {
    vi.mocked(mockRepo.delete).mockResolvedValue(false);
    const response = await DELETE(req(), params);
    expect(response.status).toBe(404);
  });
});
