/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/pool", () => ({
  databaseConfigured: vi.fn(() => true),
  withKioskTx: vi.fn((_id: string, fn: (c: unknown) => unknown) => fn(fakeClient)),
}));
vi.mock("@/lib/db/cases", () => ({
  getCase: vi.fn(),
  closeSessionLifecycle: vi.fn(),
}));
vi.mock("@/lib/db/documents-pg", () => ({
  PostgresDocumentRepository: vi.fn().mockImplementation(() => fakeRepo),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { cookies } from "next/headers";
import { withKioskTx, databaseConfigured } from "@/lib/db/pool";
import { getCase, closeSessionLifecycle } from "@/lib/db/cases";
import { POST } from "./route";
import { makeFakeSession } from "../../../../../test/db-mocks";

const fakeClient: any = {};
const fakeRepo = {
  deleteBySessionId: vi.fn().mockResolvedValue(1),
};

const sessionCookie = "medikiosk_session";

function setup(sessionId: string | undefined, session: any = makeFakeSession({ id: "session-a" })) {
  vi.mocked(cookies).mockReturnValue({
    get: vi.fn((name: string) => (name === sessionCookie && sessionId ? { name: sessionCookie, value: sessionId } : undefined)),
    set: vi.fn(),
  } as any);
  vi.mocked(getCase).mockResolvedValue(session);
}

describe("POST /api/patient/session/reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (databaseConfigured as any).mockReturnValue(true);
  });

  it("returns 503 when the database is not configured", async () => {
    (databaseConfigured as any).mockReturnValue(false);
    setup("session-a");
    const response = await POST();
    expect(response.status).toBe(503);
  });

  it("completes the session, purges its documents and clears the cookie", async () => {
    setup("session-a");
    fakeRepo.deleteBySessionId.mockResolvedValueOnce(1);

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ reset: true, session: null, deletedDocuments: 1 });
    expect(closeSessionLifecycle).toHaveBeenCalled();
    // The session cookie is cleared.
    const cookieSet = response.cookies.get(sessionCookie);
    expect(cookieSet).toBeDefined();
  });

  it("does not touch the lifecycle when the session no longer exists", async () => {
    setup("session-a", null);

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.deletedDocuments).toBe(0);
    expect(closeSessionLifecycle).not.toHaveBeenCalled();
  });

  it("does not close an already completed session", async () => {
    setup("session-a", makeFakeSession({ id: "session-a", status: "COMPLETED" }));

    const response = await POST();
    expect(response.status).toBe(200);
    expect(closeSessionLifecycle).not.toHaveBeenCalled();
  });

  it("is idempotent when no session cookie is present", async () => {
    setup(undefined);

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ reset: true, session: null, deletedDocuments: 0 });
    expect(closeSessionLifecycle).not.toHaveBeenCalled();
  });
});

void withKioskTx;
