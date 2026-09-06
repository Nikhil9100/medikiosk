import { describe, expect, it } from "vitest";
import { defaultPatientWorkflow, nextStep, previousStep } from "./patient-flow";

describe("patient onboarding flow", () => {
  it("starts with language and consent not collected", () => {
    expect(defaultPatientWorkflow.language).toBe("en");
    expect(defaultPatientWorkflow.currentStep).toBe("welcome");
    expect(defaultPatientWorkflow.consentStatus).toBe("NOT_REVIEWED");
  });

  it("does not advance through consent without explicit acceptance", () => {
    expect(nextStep("consent", "NOT_REVIEWED")).toBe("consent");
    expect(nextStep("consent", "DECLINED")).toBe("consent");
    expect(nextStep("consent", "ACCEPTED")).toBe("start");
  });

  it("keeps back navigation inside the onboarding flow", () => {
    expect(previousStep("start")).toBe("consent");
    expect(previousStep("consent")).toBe("language");
    expect(previousStep("language")).toBe("welcome");
  });
});
