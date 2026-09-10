import { describe, expect, it } from "vitest";
import { canTransitionCaseStatus, caseStatusOnCompletion, severityRank } from "./case-status";

describe("canonical case status transitions", () => {
  it("moves NEW -> IN_PROGRESS", () => {
    expect(canTransitionCaseStatus("NEW", "IN_PROGRESS")).toBe(true);
  });

  it("moves IN_PROGRESS to a review state on completion", () => {
    expect(canTransitionCaseStatus("IN_PROGRESS", "AWAITING_REVIEW")).toBe(true);
    expect(canTransitionCaseStatus("IN_PROGRESS", "URGENT_REVIEW")).toBe(true);
  });

  it("moves review states -> IN_CONSULTATION -> COMPLETED", () => {
    expect(canTransitionCaseStatus("AWAITING_REVIEW", "IN_CONSULTATION")).toBe(true);
    expect(canTransitionCaseStatus("URGENT_REVIEW", "IN_CONSULTATION")).toBe(true);
    expect(canTransitionCaseStatus("IN_CONSULTATION", "COMPLETED")).toBe(true);
  });

  it("allows cancellation from active states", () => {
    expect(canTransitionCaseStatus("IN_PROGRESS", "CANCELLED")).toBe(true);
    expect(canTransitionCaseStatus("AWAITING_REVIEW", "CANCELLED")).toBe(true);
  });

  it("never transitions out of terminal states", () => {
    expect(canTransitionCaseStatus("COMPLETED", "IN_CONSULTATION")).toBe(false);
    expect(canTransitionCaseStatus("CANCELLED", "IN_PROGRESS")).toBe(false);
  });

  it("rejects skipping ahead", () => {
    expect(canTransitionCaseStatus("NEW", "IN_CONSULTATION")).toBe(false);
    expect(canTransitionCaseStatus("IN_PROGRESS", "COMPLETED")).toBe(false);
    expect(canTransitionCaseStatus("AWAITING_REVIEW", "COMPLETED")).toBe(false);
  });
});

describe("case status on completion", () => {
  it("escalates to URGENT_REVIEW when unreviewed signals exist", () => {
    expect(caseStatusOnCompletion(true)).toBe("URGENT_REVIEW");
  });

  it("goes to AWAITING_REVIEW without signals", () => {
    expect(caseStatusOnCompletion(false)).toBe("AWAITING_REVIEW");
  });
});

describe("severity ranking", () => {
  it("orders mild < moderate < severe < very severe", () => {
    expect(severityRank.MILD).toBeLessThan(severityRank.MODERATE);
    expect(severityRank.MODERATE).toBeLessThan(severityRank.SEVERE);
    expect(severityRank.SEVERE).toBeLessThan(severityRank.VERY_SEVERE);
  });
});
