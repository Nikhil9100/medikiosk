import { describe, expect, it } from "vitest";
import { createPatientSession, validateClinicalFact } from "./clinical-state";

describe("clinical state baseline", () => {
  it("creates a patient session with isolated session metadata", () => {
    const session = createPatientSession("patient-123");

    expect(session.id).toMatch(/^[a-z0-9-]+$/i);
    expect(session.patientId).toBe("patient-123");
    expect(session.language).toBe("en");
    expect(session.isActive).toBe(true);
  });

  it("uses explicit clinical fact states and provenance", () => {
    const result = validateClinicalFact({
      questionId: "chief_complaint",
      value: "fever",
      provenance: "PATIENT",
      state: "KNOWN",
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("clinical fact should validate successfully");
    }
    expect(result.data.provenance).toBe("PATIENT");
  });
});
