/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { documentRepository } from "@/lib/ocr/document-repository";
import { createDocumentRecord } from "@/lib/documents";
import { POST } from "./route";

const sessionCookie = "medikiosk_session";

function makeThenable() {
  const thenable: any = {
    eq: () => thenable,
    then: (resolve: (value: unknown) => void) => {
      resolve({ error: null });
    },
  };
  return thenable;
}

function setup(sessionId: string | undefined) {
  const updateMock = vi.fn(() => makeThenable());
  const supabase = {
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: "user-123" } }, error: null })),
    },
    from: vi.fn(() => ({ update: updateMock })),
  };
  vi.mocked(createSupabaseServerClient).mockReturnValue(supabase as any);

  vi.mocked(cookies).mockReturnValue({
    get: vi.fn((name: string) => name === sessionCookie && sessionId ? { name: sessionCookie, value: sessionId } : undefined),
    set: vi.fn(),
  } as any);

  return { updateMock };
}

describe("POST /api/patient/session/reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication", async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null }, error: new Error("no user") })) },
    } as any);

    const response = await POST();
    expect(response.status).toBe(401);
  });

  it("completes the session, purges its documents and clears the cookie", async () => {
    const docA = createDocumentRecord("session-a", new File(["x"], "a.pdf", { type: "application/pdf" }));
    const docB = createDocumentRecord("session-b", new File(["y"], "b.pdf", { type: "application/pdf" }));
    await documentRepository.save(docA);
    await documentRepository.save(docB);

    const { updateMock } = setup("session-a");

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ reset: true, session: null, deletedDocuments: 1 });
    expect(updateMock).toHaveBeenCalled();
    const updateArgs = updateMock.mock.calls[0] as unknown[];
    expect(updateArgs[0]).toMatchObject({ status: "COMPLETED" });

    // Patient A's transient documents are purged; Patient B's remain.
    expect(await documentRepository.findById(docA.id)).toBeNull();
    expect(await documentRepository.findById(docB.id)).not.toBeNull();

    // The session cookie is cleared.
    expect(response.cookies.get(sessionCookie)?.value).toBe("");
  });

  it("is idempotent when no session cookie is present", async () => {
    const { updateMock } = setup(undefined);

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ reset: true, session: null, deletedDocuments: 0 });
    expect(updateMock).not.toHaveBeenCalled();
  });
});
