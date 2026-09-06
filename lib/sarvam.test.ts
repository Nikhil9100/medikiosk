import { describe, expect, it } from "vitest";
import {
  mapApplicationLanguageToSarvam,
} from "./sarvam";

describe("sarvam provider", () => {
  it("maps application language codes to Sarvam BCP-47 codes", () => {
    expect(mapApplicationLanguageToSarvam("en")).toBe("en-IN");
    expect(mapApplicationLanguageToSarvam("hi")).toBe("hi-IN");
    expect(mapApplicationLanguageToSarvam("bn")).toBe("bn-IN");
    expect(mapApplicationLanguageToSarvam("te")).toBe("te-IN");
    expect(mapApplicationLanguageToSarvam("ta")).toBe("ta-IN");
    expect(mapApplicationLanguageToSarvam("mr")).toBe("mr-IN");
  });

  it("rejects unsupported language codes", () => {
    expect(() => mapApplicationLanguageToSarvam("fr")).toThrow("Unsupported language: fr");
    expect(() => mapApplicationLanguageToSarvam("")).toThrow("Unsupported language: ");
  });
});
