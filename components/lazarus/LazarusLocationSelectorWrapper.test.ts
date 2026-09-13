import { describe, expect, it } from "vitest";
import { determineLazarusBodyPart } from "./LazarusLocationSelectorWrapper";

describe("determineLazarusBodyPart algorithm", () => {
  const width = 22;
  const height = 15;

  it("identifies head and face depending on front/back view", () => {
    // Top center (x: 39, y: 5) -> center is (50, 12.5) -> < chinYLine (27)
    const frontHead = determineLazarusBodyPart(39, 5, width, height, true, false);
    expect(frontHead).toBe("face");

    const backHead = determineLazarusBodyPart(39, 5, width, height, false, false);
    expect(backHead).toBe("head");
  });

  it("identifies neck between chin line and torso line", () => {
    // y center around 28.5 (y: 21, height: 15 -> center: 28.5)
    const neck = determineLazarusBodyPart(39, 21, width, height, true, false);
    expect(neck).toBe("neck");
  });

  it("identifies chest / torso and back", () => {
    // Upper torso (center: 50, 35) -> torsoTopLine (30) < centerY < abdomenTopLine (40)
    const frontTorso = determineLazarusBodyPart(39, 27.5, width, height, true, false);
    expect(frontTorso).toBe("torso");

    const backTorso = determineLazarusBodyPart(39, 27.5, width, height, false, false);
    expect(backTorso).toBe("back");
  });

  it("identifies abdomen and lower back", () => {
    // Lower torso (center: 50, 44) -> abdomenTopLine (40) < centerY < legTopLine (50)
    const abdomen = determineLazarusBodyPart(39, 36.5, width, height, true, false);
    expect(abdomen).toBe("abdomen");

    const lowerBack = determineLazarusBodyPart(39, 36.5, width, height, false, false);
    expect(lowerBack).toBe("lower back");
  });

  it("identifies arms and hands correctly with anatomical lateralities", () => {
    // Observer's left (centerX < midLine):
    // In front view, this is anatomical right arm
    const rightArm = determineLazarusBodyPart(15, 38, width, height, true, false);
    expect(rightArm).toBe("right arm");

    // In back view, observer's left is anatomical left arm
    const leftArmBack = determineLazarusBodyPart(15, 38, width, height, false, false);
    expect(leftArmBack).toBe("left arm");
  });

  it("identifies legs and feet correctly", () => {
    // Leg: centerY > legTopLine (50) & centerY < footTopLine (85)
    const leftLeg = determineLazarusBodyPart(45, 55, width, height, true, false);
    expect(leftLeg).toBe("left leg");

    // Foot: centerY > footTopLine (85)
    const leftFoot = determineLazarusBodyPart(45, 80, width, height, true, false);
    expect(leftFoot).toBe("left foot");
  });

  it("returns empty string for outside margins", () => {
    const outside = determineLazarusBodyPart(0, 0, width, height, true, false);
    expect(outside).toBe("");
  });
});
