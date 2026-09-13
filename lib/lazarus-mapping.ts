import type { PatientBodyRegion, PatientBodySubregion } from "@/lib/patient-flow";

/**
 * The authoritative list of all body-part string values that can be returned
 * by the Lazarus Location Selector's generateBodyPart(x, y) algorithm.
 */
export type LazarusBodyPart =
  | ""
  | "neck"
  | "face"
  | "head"
  | "torso"
  | "back"
  | "abdomen"
  | "lower back"
  | "left foot"
  | "right foot"
  | "left leg"
  | "right leg"
  | "left hand"
  | "right hand"
  | "left arm"
  | "right arm";

export interface CanonicalAnatomyMapping {
  region: PatientBodyRegion | null;
  subregion: PatientBodySubregion | null;
  side: "left" | "right" | null;
  lazarusName: string;
}

/**
 * Explicit mapping table converting every possible Lazarus output string into
 * the canonical MediKiosk PatientBodyRegion and PatientBodySubregion taxonomy.
 *
 * Laterality (left/right):
 * In MediKiosk's canonical data model, laterality is preserved directly in the
 * `selectedSubregion` field for extremities ("arm", "hand", "leg", "foot"),
 * where "left" and "right" are first-class subregion enum values.
 */
export const lazarusToRegionMap: Record<
  LazarusBodyPart,
  { region: PatientBodyRegion | null; subregion: PatientBodySubregion | null; side: "left" | "right" | null }
> = {
  "": {
    region: null,
    subregion: null,
    side: null,
  },
  neck: {
    region: "head",
    subregion: "upper",
    side: null,
  },
  face: {
    region: "head",
    subregion: "face",
    side: null,
  },
  head: {
    region: "head",
    subregion: "upper",
    side: null,
  },
  torso: {
    region: "chest",
    subregion: "front",
    side: null,
  },
  back: {
    region: "back",
    subregion: "back",
    side: null,
  },
  abdomen: {
    region: "abdomen",
    subregion: "upper",
    side: null,
  },
  "lower back": {
    region: "back",
    subregion: "middle",
    side: null,
  },
  "left arm": {
    region: "arm",
    subregion: "left",
    side: "left",
  },
  "right arm": {
    region: "arm",
    subregion: "right",
    side: "right",
  },
  "left hand": {
    region: "hand",
    subregion: "left",
    side: "left",
  },
  "right hand": {
    region: "hand",
    subregion: "right",
    side: "right",
  },
  "left leg": {
    region: "leg",
    subregion: "left",
    side: "left",
  },
  "right leg": {
    region: "leg",
    subregion: "right",
    side: "right",
  },
  "left foot": {
    region: "foot",
    subregion: "left",
    side: "left",
  },
  "right foot": {
    region: "foot",
    subregion: "right",
    side: "right",
  },
};

/**
 * Maps a raw Lazarus location string (e.g. from onChangeSelection or getLocationData)
 * to the canonical MediKiosk anatomy selection.
 */
export function mapLazarusToCanonical(rawLocation: string | null | undefined): CanonicalAnatomyMapping {
  if (!rawLocation) {
    return { region: null, subregion: null, side: null, lazarusName: "" };
  }

  const normalized = rawLocation.trim().toLowerCase() as LazarusBodyPart;
  const mapped = lazarusToRegionMap[normalized];

  if (!mapped) {
    // Graceful fallback for any unanticipated string
    return { region: null, subregion: null, side: null, lazarusName: rawLocation };
  }

  return {
    ...mapped,
    lazarusName: rawLocation,
  };
}
