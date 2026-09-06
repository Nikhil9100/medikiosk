import { describe, expect, it } from "vitest";
import { getTranslation } from "@/lib/i18n";

describe("MediKiosk patient shell foundation", () => {
  it("keeps English available as the fallback language", () => {
    expect(getTranslation("en", "brand")).toBe("MediKiosk");
    expect(getTranslation("hi", "brand")).toBe("MediKiosk");
    expect(getTranslation("en", "welcomeTitle")).toContain("health");
  });
});
