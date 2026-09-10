import { describe, expect, it } from "vitest";
import { transitionCase, type CaseRecord } from "./cases";

/**
 * Regression tests for UPDATE parameterization in the case-status code paths.
 *
 * A past bug built `SET case_status = $1, completed_at = $1 ... WHERE id = $3`
 * (a push() return value reused $1), which Postgres rejected with 42P08
 * "inconsistent types deduced for parameter $1". The fake client here executes
 * no SQL — it captures statements and asserts on the parameterization itself,
 * which is exactly what the type-inference error was about.
 */

function makeFakeClient(initialStatus: CaseRecord["caseStatus"]) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const base: Record<string, unknown> = {
    id: "11111111-1111-1111-1111-111111111111",
    case_no: 10,
    case_id: "CASE-1010",
    owner_id: "22222222-2222-2222-2222-222222222222",
    status: "ACTIVE",
    case_status: initialStatus,
    language: "en",
    consent_status: "ACCEPTED",
    consent_version: "phase-2-v1",
    consent_timestamp: new Date("2026-09-10T10:00:00Z"),
    workflow_step: "complete",
    complaint_text: null,
    body_region: null,
    body_subregion: null,
    interview_data: null,
    demo_flag: false,
    cancellation_reason: null,
    summary: null,
    created_at: new Date("2026-09-10T09:58:00Z"),
    updated_at: new Date("2026-09-10T10:01:00Z"),
    expires_at: new Date("2026-09-10T10:28:00Z"),
    completed_at: null,
  };
  const client = {
    async query(sql: string, values: unknown[] = []) {
      calls.push({ sql, values });
      if (/^UPDATE patient_sessions SET case_status/.test(sql)) {
        return { rows: [{ ...base, case_status: (values[0] as string) ?? base.case_status }] };
      }
      if (/^INSERT INTO audit_log/.test(sql)) return { rows: [] };
      // getCase SELECT
      return { rows: [base] };
    },
  } as unknown as import("pg").PoolClient;
  return { client, calls };
}

function placeholders(sql: string): string[] {
  return [...sql.matchAll(/\$(\d+)/g)].map((m) => m[1]);
}

describe("transitionCase SQL parameterization", () => {
  it("COMPLETED: no placeholder is used twice and values align", async () => {
    const { client, calls } = makeFakeClient("IN_CONSULTATION");
    const result = await transitionCase(client, baseId(), "COMPLETED", {
      type: "STAFF",
      id: "33333333-3333-3333-3333-333333333333",
    });
    expect(result).not.toBeNull();

    const update = calls.find((c) => /^UPDATE patient_sessions SET case_status/.test(c.sql));
    expect(update).toBeDefined();
    const ph = placeholders(update!.sql);
    const dupes = ph.filter((p, i) => ph.indexOf(p) !== i);
    expect(dupes).toEqual([]);
    expect(update!.sql).toContain("completed_at = $2");
    expect(update!.sql).toContain("WHERE id = $3");
    expect(update!.values).toHaveLength(3);
    expect(update!.values[0]).toBe("COMPLETED");
    expect(typeof update!.values[1]).toBe("string");
    expect(update!.values[2]).toBe(baseId());
  });

  it("non-terminal transition: WHERE id is the second placeholder", async () => {
    const { client, calls } = makeFakeClient("AWAITING_REVIEW");
    await transitionCase(client, baseId(), "IN_CONSULTATION", { type: "STAFF", id: "s1" });
    const update = calls.find((c) => /^UPDATE patient_sessions SET case_status/.test(c.sql));
    expect(update).toBeDefined();
    const ph = placeholders(update!.sql);
    expect(ph).toEqual([...ph].filter((p, i) => ph.indexOf(p) === i));
    expect(update!.sql).toContain("WHERE id = $2");
    expect(update!.values).toEqual(["IN_CONSULTATION", baseId()]);
  });
});

function baseId() {
  return "11111111-1111-1111-1111-111111111111";
}
