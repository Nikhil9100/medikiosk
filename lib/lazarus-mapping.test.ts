import { describe, expect, it } from "vitest";
import {
  lazarusToRegionMap,
  mapLazarusToCanonical,
  type LazarusBodyPart,
} from "./lazarus-mapping";

describe("Lazarus Canonical Taxonomy Mapping", () => {
  const allAuthoritativeParts: LazarusBodyPart[] = [
    "",
    "neck",
    "face",
    "head",
    "torso",
    "back",
    "abdomen",
    "lower back",
    "left foot",
    "right foot",
    "left leg",
    "right leg",
    "left hand",
    "right hand",
    "left arm",
    "right arm",
  ];

  it("covers all 16 authoritative Lazarus output values without omission", () => {
    expect(Object.keys(lazarusToRegionMap)).toHaveLength(16);
    for (const part of allAuthoritativeParts) {
      expect(lazarusToRegionMap).toHaveProperty(part);
    }
  });

  it("correctly maps empty string to null canonical region and subregion", () => {
    const result = mapLazarusToCanonical("");
    expect(result.region).toBeNull();
    expect(result.subregion).toBeNull();
    expect(result.side).toBeNull();
  });

  it("correctly maps head and neck regions with subregions", () => {
    const face = mapLazarusToCanonical("face");
    expect(face.region).toBe("head");
    expect(face.subregion).toBe("face");

    const head = mapLazarusToCanonical("head");
    expect(head.region).toBe("head");
    expect(head.subregion).toBe("upper");

    const neck = mapLazarusToCanonical("neck");
    expect(neck.region).toBe("head");
    expect(neck.subregion).toBe("upper");
  });

  it("correctly maps torso and abdomen", () => {
    const torso = mapLazarusToCanonical("torso");
    expect(torso.region).toBe("chest");
    expect(torso.subregion).toBe("front");

    const abdomen = mapLazarusToCanonical("abdomen");
    expect(abdomen.region).toBe("abdomen");
    expect(abdomen.subregion).toBe("upper");
  });

  it("correctly maps back and lower back", () => {
    const back = mapLazarusToCanonical("back");
    expect(back.region).toBe("back");
    expect(back.subregion).toBe("back");

    const lowerBack = mapLazarusToCanonical("lower back");
    expect(lowerBack.region).toBe("back");
    expect(lowerBack.subregion).toBe("middle");
  });

  it("correctly maps extremity laterality to canonical subregions", () => {
    const leftArm = mapLazarusToCanonical("left arm");
    expect(leftArm.region).toBe("arm");
    expect(leftArm.subregion).toBe("left");
    expect(leftArm.side).toBe("left");

    const rightArm = mapLazarusToCanonical("right arm");
    expect(rightArm.region).toBe("arm");
    expect(rightArm.subregion).toBe("right");
    expect(rightArm.side).toBe("right");

    const leftHand = mapLazarusToCanonical("left hand");
    expect(leftHand.region).toBe("hand");
    expect(leftHand.subregion).toBe("left");
    expect(leftHand.side).toBe("left");

    const rightHand = mapLazarusToCanonical("right hand");
    expect(rightHand.region).toBe("hand");
    expect(rightHand.subregion).toBe("right");
    expect(rightHand.side).toBe("right");

    const leftLeg = mapLazarusToCanonical("left leg");
    expect(leftLeg.region).toBe("leg");
    expect(leftLeg.subregion).toBe("left");
    expect(leftLeg.side).toBe("left");

    const rightLeg = mapLazarusToCanonical("right leg");
    expect(rightLeg.region).toBe("leg");
    expect(rightLeg.subregion).toBe("right");
    expect(rightLeg.side).toBe("right");

    const leftFoot = mapLazarusToCanonical("left foot");
    expect(leftFoot.region).toBe("foot");
    expect(leftFoot.subregion).toBe("left");
    expect(leftFoot.side).toBe("left");

    const rightFoot = mapLazarusToCanonical("right foot");
    expect(rightFoot.region).toBe("foot");
    expect(rightFoot.subregion).toBe("right");
    expect(rightFoot.side).toBe("right");
  });

  it("handles null, undefined, and unknown strings gracefully", () => {
    expect(mapLazarusToCanonical(null).region).toBeNull();
    expect(mapLazarusToCanonical(undefined).region).toBeNull();
    expect(mapLazarusToCanonical("unknown_random_zone").region).toBeNull();
  });
});
