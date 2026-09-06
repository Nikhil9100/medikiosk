import { describe, expect, it } from "vitest";
import { createSession, isSessionActive } from "./session";

describe("patient session boundary", () => {
  it("creates an active expiring session without clinical data", () => {
    const now = new Date("2026-09-06T08:00:00.000Z");
    const session = createSession("hi", now);

    expect(session.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(session.status).toBe("ACTIVE");
    expect(session.language).toBe("hi");
    expect(isSessionActive(session, new Date("2026-09-06T08:10:00.000Z"))).toBe(true);
    expect(isSessionActive(session, new Date("2026-09-06T08:31:00.000Z"))).toBe(false);
  });

  it("does not treat an expired session as active", () => {
    const now = new Date("2026-09-06T08:00:00.000Z");
    const session = createSession("en", now);
    expect(isSessionActive({ ...session, status: "EXPIRED" }, now)).toBe(false);
  });
});
