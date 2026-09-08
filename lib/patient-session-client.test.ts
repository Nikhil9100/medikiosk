import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: vi.fn(),
}));

import { bootstrapPatientSession, updatePatientSession } from "./patient-session-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const idempotencyStorageKey = "medikiosk.patient.session.idempotency";
const mockFetch = vi.fn();

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const authenticatedSupabase = () => ({
  auth: {
    getUser: vi.fn(async () => ({ data: { user: { id: "anon-1" } }, error: null })),
    signInAnonymously: vi.fn(async () => ({ data: {}, error: null })),
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
  vi.mocked(createSupabaseBrowserClient).mockReturnValue(authenticatedSupabase() as never);
});

describe("bootstrapPatientSession", () => {
  it("reuses an existing active session from the cookie", async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/patient/session" && (!init?.method || init.method === "GET")) {
        return Promise.resolve(jsonResponse({ session: { id: "existing-session", status: "ACTIVE" } }));
      }
      return Promise.resolve(jsonResponse({ error: "unexpected" }, 500));
    });

    const session = await bootstrapPatientSession("en");

    expect(session.id).toBe("existing-session");
    expect(createSupabaseBrowserClient).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("creates a fresh session when the cookie references a completed session", async () => {
    window.localStorage.setItem(idempotencyStorageKey, "done-key");
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/patient/session" && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ session: { id: "fresh-session", status: "ACTIVE" } }, 201));
      }
      if (url === "/api/patient/session" && (!init?.method || init.method === "GET")) {
        return Promise.resolve(jsonResponse({ session: { id: "completed-session", status: "COMPLETED" } }));
      }
      return Promise.resolve(jsonResponse({ error: "unexpected" }, 500));
    });

    const session = await bootstrapPatientSession("en");

    expect(session.id).toBe("fresh-session");
    expect(window.localStorage.getItem(idempotencyStorageKey)).not.toBe("done-key");
    expect(mockFetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true);
  });

  it("creates a session with an idempotency key when none exists", async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/patient/session" && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ session: { id: "fresh-session" } }, 201));
      }
      if (url === "/api/patient/session" && (!init?.method || init.method === "GET")) {
        return Promise.resolve(jsonResponse({ error: "No active session" }, 404));
      }
      return Promise.resolve(jsonResponse({ error: "unexpected" }, 500));
    });

    const session = await bootstrapPatientSession("hi");

    expect(session.id).toBe("fresh-session");
    const postCall = mockFetch.mock.calls.find(([, init]) => init?.method === "POST");
    const [, init] = postCall as [string, RequestInit];
    expect(init.headers).toEqual(expect.objectContaining({ "Idempotency-Key": expect.any(String) }));
    expect(init.body).toBe(JSON.stringify({ language: "hi" }));
  });

  it("discards an expired session's idempotency key before creating a fresh one", async () => {
    window.localStorage.setItem(idempotencyStorageKey, "stale-key");
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/patient/session" && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ session: { id: "fresh-session" } }, 201));
      }
      if (url === "/api/patient/session" && (!init?.method || init.method === "GET")) {
        return Promise.resolve(jsonResponse({ error: "Session expired" }, 410));
      }
      return Promise.resolve(jsonResponse({ error: "unexpected" }, 500));
    });

    await bootstrapPatientSession("en");

    expect(window.localStorage.getItem(idempotencyStorageKey)).not.toBe("stale-key");
    expect(mockFetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true);
  });

  it("throws when the session cannot be created", async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/patient/session" && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ error: "Unable to create session" }, 503));
      }
      if (url === "/api/patient/session" && (!init?.method || init.method === "GET")) {
        return Promise.resolve(jsonResponse({ error: "No active session" }, 404));
      }
      return Promise.resolve(jsonResponse({ error: "unexpected" }, 500));
    });

    await expect(bootstrapPatientSession("en")).rejects.toThrow("Patient session could not be established");
  });

  it("signs in anonymously before establishing a session when unauthenticated", async () => {
    vi.mocked(createSupabaseBrowserClient).mockReturnValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
        signInAnonymously: vi.fn(async () => ({ data: {}, error: null })),
      },
    } as never);

    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/patient/session" && (!init?.method || init.method === "GET")) {
        return Promise.resolve(jsonResponse({ session: { id: "existing-session", status: "ACTIVE" } }));
      }
      return Promise.resolve(jsonResponse({ error: "unexpected" }, 500));
    });

    await bootstrapPatientSession("en");

    const supabase = vi.mocked(createSupabaseBrowserClient).mock.results[0].value;
    expect(supabase.auth.signInAnonymously).toHaveBeenCalled();
  });
});

describe("updatePatientSession", () => {
  it("PATCHes the updated fields to the session endpoint", async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/patient/session" && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ session: { id: "existing-session" } }));
      }
      return Promise.resolve(jsonResponse({ error: "unexpected" }, 500));
    });

    await updatePatientSession({ complaintText: "headache", workflowStep: "complaint" });

    const patchCall = mockFetch.mock.calls.find(([, init]) => init?.method === "PATCH");
    const [, init] = patchCall as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ complaintText: "headache", workflowStep: "complaint" }));
  });

  it("throws when the session update is rejected", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(jsonResponse({ error: "Invalid session update" }, 400)));

    await expect(updatePatientSession({ complaintText: "headache" })).rejects.toThrow(
      "Patient session could not be updated",
    );
  });
});