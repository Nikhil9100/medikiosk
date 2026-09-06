import { describe, expect, it } from "vitest";
import {
  BodyRegionSchema,
  createPatientSession,
  validateBodyRegionSelection,
  validateClinicalFact,
} from "./clinical-state";

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

  it("keeps complaint intent explicit when empty and not treated as no complaint", () => {
    const result = validateClinicalFact({
      questionId: "chief_complaint",
      value: "",
      provenance: "PATIENT",
      state: "NOT_ASKED",
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("empty complaint should remain explicit and valid");
    }
    expect(result.data.state).toBe("NOT_ASKED");
  });

  it("accepts a valid body region and rejects invalid regions", () => {
    const valid = validateBodyRegionSelection({ region: "head", subregion: "front" });
    expect(valid.success).toBe(true);

    const invalid = validateBodyRegionSelection({ region: "invalid-region" as never, subregion: "front" });
    expect(invalid.success).toBe(false);
    expect(BodyRegionSchema.safeParse("head").success).toBe(true);
  });
});
