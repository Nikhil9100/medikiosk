import { describe, expect, it } from "vitest";
import { buildClinicalSummary } from "./clinical-summary";
import { makeFakeSession } from "../test/db-mocks";

function baseParams(overrides: Record<string, unknown> = {}) {
  return {
    caseRecord: makeFakeSession(),
    complaints: [],
    globalInterview: null,
    documents: [],
    evidence: [],
    signals: [],
    ...overrides,
  };
}

describe("buildClinicalSummary", () => {
  it("reports the primary complaint and others separately", () => {
    const summary = buildClinicalSummary(
      baseParams({
        complaints: [
          {
            id: "c1", sessionId: "s", position: 1, complaintText: "Stomach pain",
            bodyRegion: "abdomen", bodySubregion: null, severity: "MODERATE",
            interviewData: null, status: "ACTIVE", createdAt: new Date(), updatedAt: new Date(),
          },
          {
            id: "c2", sessionId: "s", position: 2, complaintText: "Headache",
            bodyRegion: "head", bodySubregion: null, severity: "MILD",
            interviewData: null, status: "ACTIVE", createdAt: new Date(), updatedAt: new Date(),
          },
        ],
      }),
    );
    expect(summary.primaryComplaint).toMatchObject({ position: 1, text: "Stomach pain", severity: "MODERATE" });
    expect(summary.otherComplaints).toHaveLength(1);
    expect(summary.otherComplaints[0]).toMatchObject({ position: 2, text: "Headache", severity: "MILD" });
  });

  it("treats DENIED as a valid answer, not missing information", () => {
    const summary = buildClinicalSummary(
      baseParams({
        globalInterview: {
          medication_current: { questionId: "medication_current", state: "DENIED", provenance: "PATIENT" },
          allergy_medicine: { questionId: "allergy_medicine", state: "DENIED", provenance: "PATIENT" },
        },
      }),
    );
    expect(summary.missingInformation).toEqual([]);
  });

  it("reports NOT_ASKED and UNKNOWN as missing", () => {
    const summary = buildClinicalSummary(
      baseParams({
        globalInterview: {
          medication_current: { questionId: "medication_current", state: "DENIED", provenance: "PATIENT" },
          allergy_medicine: { questionId: "allergy_medicine", state: "NOT_ASKED", provenance: "PATIENT" },
          ros_details: { questionId: "ros_details", value: null, state: "UNKNOWN", provenance: "PATIENT" },
        },
      }),
    );
    expect(summary.missingInformation).toContain("allergy_medicine");
    expect(summary.missingInformation).toContain("ros_details");
    expect(summary.missingInformation).not.toContain("medication_current");
  });

  it("reports required questions never asked as missing", () => {
    const summary = buildClinicalSummary(baseParams({}));
    expect(summary.missingInformation).toContain("medication_current");
    expect(summary.missingInformation).toContain("allergy_medicine");
  });

  it("counts evidence verification per document", () => {
    const summary = buildClinicalSummary(
      baseParams({
        documents: [{ id: "d1", originalFilename: "rx.pdf", documentType: "PRESCRIPTION", ocrStatus: "COMPLETED", extractionStatus: "COMPLETED" }],
        evidence: [
          { id: "e1", documentId: "d1", verificationState: "VERIFIED" } as never,
          { id: "e2", documentId: "d1", verificationState: "UNVERIFIED" } as never,
          { id: "e3", documentId: "d1", verificationState: "REJECTED" } as never,
        ],
      }),
    );
    expect(summary.documents[0]).toMatchObject({ evidenceCount: 3, verifiedCount: 1, rejectedCount: 1 });
  });

  it("keeps signals with status and source", () => {
    const summary = buildClinicalSummary(
      baseParams({
        signals: [{ type: "CHEST_PAIN_URGENT", summary: "s", reason: "r", status: "UNREVIEWED", source: "PATIENT" }],
      }),
    );
    expect(summary.safetySignals[0]).toMatchObject({ type: "CHEST_PAIN_URGENT", status: "UNREVIEWED", source: "PATIENT" });
  });

  it("orders complaints by position for primary selection", () => {
    const summary = buildClinicalSummary(
      baseParams({
        complaints: [
          {
            id: "c2", sessionId: "s", position: 2, complaintText: "Second",
            bodyRegion: null, bodySubregion: null, severity: null,
            interviewData: null, status: "ACTIVE", createdAt: new Date(), updatedAt: new Date(),
          },
          {
            id: "c1", sessionId: "s", position: 1, complaintText: "First",
            bodyRegion: null, bodySubregion: null, severity: null,
            interviewData: null, status: "ACTIVE", createdAt: new Date(), updatedAt: new Date(),
          },
        ],
      }),
    );
    expect(summary.primaryComplaint?.text).toBe("First");
  });
});
