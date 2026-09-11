import { describe, expect, it } from "vitest";
import { detectSafetySignals, dedupeSignals } from "./safety-signals";
import type { Severity } from "./case-status";

const base = {
  complaints: [] as Array<{ text: string; region: string | null; severity: Severity | null; position: number }>,
  facts: [] as Array<{ questionId: string; value?: string | null; state: string }>,
  evidence: [] as Array<{ id: string; category: string; primaryValue: string; detail?: string | null }>,
};

describe("detectSafetySignals", () => {
  it("flags chest pain with high severity", () => {
    const drafts = detectSafetySignals({
      ...base,
      complaints: [{ text: "Chest pain", region: "chest", severity: "SEVERE", position: 1 }],
    });
    expect(drafts.map((d) => d.type)).toContain("CHEST_PAIN_URGENT");
    const chest = drafts.find((d) => d.type === "CHEST_PAIN_URGENT")!;
    expect(chest.reason).toContain("SEVERE");
    expect(chest.evidenceRef).toBe("complaint:1");
  });

  it("flags chest pain by region even with mild severity", () => {
    const drafts = detectSafetySignals({
      ...base,
      complaints: [{ text: "Tightness", region: "chest", severity: "MILD", position: 2 }],
    });
    expect(drafts.map((d) => d.type)).toContain("CHEST_PAIN_URGENT");
  });

  it("flags breathlessness from interview text", () => {
    const drafts = detectSafetySignals({
      ...base,
      facts: [{ questionId: "ros_details", value: "I am breathless", state: "KNOWN" }],
    });
    expect(drafts.map((d) => d.type)).toContain("BREATHLESSNESS");
  });

  it("flags neurological descriptors", () => {
    const drafts = detectSafetySignals({
      ...base,
      facts: [{ questionId: "ros_details", value: "I have weakness on one side of my body", state: "KNOWN" }],
    });
    expect(drafts.map((d) => d.type)).toContain("NEUROLOGICAL");
  });

  it("flags slurred speech", () => {
    const drafts = detectSafetySignals({
      ...base,
      facts: [{ questionId: "ros_details", value: "my speech is slurred", state: "KNOWN" }],
    });
    expect(drafts.map((d) => d.type)).toContain("NEUROLOGICAL");
  });

  it("flags head trauma (fall onto the head) with complaint reference", () => {
    const drafts = detectSafetySignals({
      ...base,
      complaints: [{ text: "I fell on my head two days ago and have a headache since", region: "head", severity: null, position: 1 }],
    });
    const head = drafts.find((d) => d.type === "HEAD_TRAUMA");
    expect(head).toBeDefined();
    expect(head?.evidenceRef).toBe("complaint:1");
    expect(head?.source).toBe("PATIENT");
  });

  it("flags head trauma reported in Hindi", () => {
    const drafts = detectSafetySignals({
      ...base,
      complaints: [{ text: "गिरकर सिर पर चोट लगी है", region: "head", severity: null, position: 1 }],
    });
    expect(drafts.map((d) => d.type)).toContain("HEAD_TRAUMA");
  });

  it("does NOT flag a plain headache as head trauma", () => {
    const drafts = detectSafetySignals({
      ...base,
      complaints: [{ text: "Headache since morning", region: "head", severity: "MILD", position: 1 }],
    });
    expect(drafts.map((d) => d.type)).not.toContain("HEAD_TRAUMA");
  });

  it("flags self-harm text with escalation summary", () => {
    const drafts = detectSafetySignals({
      ...base,
      facts: [{ questionId: "ros_details", value: "I want to end my life", state: "KNOWN" }],
    });
    expect(drafts.map((d) => d.type)).toContain("SELF_HARM");
  });

  it("flags VERY_SEVERE presentations", () => {
    const drafts = detectSafetySignals({
      ...base,
      complaints: [{ text: "Belly pain", region: "abdomen", severity: "VERY_SEVERE", position: 1 }],
    });
    expect(drafts.map((d) => d.type)).toContain("SEVERE_PRESENTATION");
  });

  it("flags critical documented conditions from OCR evidence", () => {
    const drafts = detectSafetySignals({
      ...base,
      evidence: [{ id: "ev-1", category: "DIAGNOSIS", primaryValue: "Fracture of left femur" }],
    });
    expect(drafts.map((d) => d.type)).toContain("CRITICAL_CONDITION_DOCUMENTED");
    expect(drafts.find((d) => d.type === "CRITICAL_CONDITION_DOCUMENTED")!.source).toBe("OCR");
  });

  it("does NOT flag from UNKNOWN or DECLINED answers (never convert to findings)", () => {
    const drafts = detectSafetySignals({
      ...base,
      facts: [
        { questionId: "ros_details", value: "chest pain", state: "UNKNOWN" },
        { questionId: "ros_details", value: "blood", state: "DECLINED" },
        { questionId: "ros_details", value: "fainting", state: "NOT_ASKED" },
      ],
    });
    expect(drafts).toEqual([]);
  });

  it("does NOT flag mild isolated headache (no false positives)", () => {
    const drafts = detectSafetySignals({
      ...base,
      complaints: [{ text: "Mild headache", region: "head", severity: "MILD", position: 1 }],
    });
    expect(drafts).toEqual([]);
  });

  it("deduplicates by type+evidenceRef", () => {
    const drafts = detectSafetySignals({
      ...base,
      complaints: [{ text: "Chest pain", region: "chest", severity: "VERY_SEVERE", position: 1 }],
    });
    expect(drafts.filter((d) => d.type === "CHEST_PAIN_URGENT")).toHaveLength(1);
  });
});

describe("dedupeSignals against existing", () => {
  it("skips signals already recorded for the same evidence", () => {
    const existing = [{ type: "CHEST_PAIN_URGENT", evidenceRef: "complaint:1" }];
    const drafts = detectSafetySignals({
      ...base,
      complaints: [{ text: "Chest pain", region: "chest", severity: "SEVERE", position: 1 }],
    });
    expect(dedupeSignals(existing, drafts)).toEqual([]);
  });

  it("keeps new signal types", () => {
    const existing = [{ type: "CHEST_PAIN_URGENT", evidenceRef: "complaint:1" }];
    const drafts = detectSafetySignals({
      ...base,
      complaints: [{ text: "Chest pain", region: "chest", severity: "VERY_SEVERE", position: 1 }],
    });
    expect(dedupeSignals(existing, drafts).map((d) => d.type)).toEqual(["SEVERE_PRESENTATION"]);
  });
});
