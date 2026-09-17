/**
 * Deterministic medical evidence extraction engine.
 *
 * Extracts structured evidence items from OCR page text using regex rules.
 * Each rule targets a specific EvidenceCategory and only extracts information
 * that is explicitly present in the source text.
 *
 * SAFETY RULES (non-negotiable):
 * - Never infers diagnosis from symptoms or lab values
 * - Never suggests treatment recommendations
 * - Never auto-verifies extracted items (always UNVERIFIED)
 * - Never silently turns missing history into negative history
 * - Contradictions are preserved, never resolved
 */

import type {
  EvidenceCategory,
  ExtractedEvidenceItem,
  ExtractionProviderMetadata,
  NormalizedEvidenceValue,
  OcrSpan,
} from "./types";
import { createUnverifiedEvidenceItem } from "./types";

/* ------------------------------------------------------------------ */
/*  Input types                                                        */
/* ------------------------------------------------------------------ */

export interface OcrPageInput {
  pageNumber: number;
  extractedText: string;
}

/* ------------------------------------------------------------------ */
/*  Rule definitions                                                    */
/* ------------------------------------------------------------------ */

interface ExtractionRule {
  /** Category this rule extracts evidence for */
  category: EvidenceCategory;
  /** Human-readable rule ID for debugging */
  id: string;
  /** Regex to match against page text (must have 'g' flag for exec loop) */
  regex: RegExp;
  /** Base confidence when rule matches */
  baseConfidence: number;
  /** Map regex match groups to NormalizedEvidenceValue */
  toValue(match: RegExpExecArray, fullText: string): NormalizedEvidenceValue;
  /** Whether to note uncertainty about the extraction */
  uncertaintyNote?: string;
}

/**
 * Rule set for deterministic medical evidence extraction.
 * Rules are ordered by specificity — more specific patterns first.
 */
const EXTRACTION_RULES: ExtractionRule[] = [
  /* ---- DIAGNOSIS (explicit markers only, never inferred) ---- */
  {
    category: "DIAGNOSIS",
    id: "diagnosis-marker",
    regex: /(?:Diagnosis|Dx|Impression|Diagnosed as|Known case of|Known k\/o|K\/C\/O)\s*[:\-–]\s*([^\n.;]{2,120})/gi,
    baseConfidence: 0.7,
    toValue: (m) => ({
      details: m[1].trim(),
    }),
  },

  /* ---- MEDICATION ---- */
  {
    category: "MEDICATION",
    id: "medication-tab-cap",
    regex: /(?:Tab|Cap|Capsule|Susp|Inj|Syp|Oint|Drops?|Tablet|Syrup|Injection|Cream|Gel)\.?\s+([A-Z][A-Za-z0-9-]{1,30})(?:\s*(\d+(?:\.\d+)?)\s*(mg|g|ml|mcg|µg|IU|units?|gm))?/g,
    baseConfidence: 0.65,
    toValue: (m) => ({
      name: m[1].trim(),
      dose: m[2] ? `${m[2]}${m[3]}` : undefined,
      unit: m[3],
      frequency: m[4] ? m[0].match(/(?:BD|TD|OD|QID|HS|PRN|SOS|TID|BID|Q\d+h|once|twice|thrice|daily|weekly)/i)?.[0] : undefined,
    }),
    uncertaintyNote: "Extracted from OCR text. Doctor review required.",
  },
  {
    category: "MEDICATION",
    id: "medication-generic",
    // The captured list must start with a letter: prescription numbers such as
    // "RX-2026-0412" on a "Prescription No:" line must not surface as medicine.
    regex: /(?:Rx|Medication|Medicines?|Prescribed|Rx\s*ad)\s*[:\-–]\s*([A-Za-z][^\n.;]{1,119})/gi,
    baseConfidence: 0.55,
    toValue: (m) => ({
      details: m[1].trim(),
    }),
    uncertaintyNote: "Extracted from OCR text. Doctor review required.",
  },

  /* ---- INVESTIGATION ---- */
  {
    category: "INVESTIGATION",
    id: "investigation-marker",
    regex: /(?:Investigations?|Lab findings?|Test[s]?|Reports?|Laboratory)\s*[:\-–]\s*([^\n.;]{2,120})/gi,
    baseConfidence: 0.6,
    toValue: (m) => ({
      details: m[1].trim(),
    }),
    uncertaintyNote: "Extracted from OCR text. Doctor review required.",
  },
  {
    category: "INVESTIGATION",
    id: "investigation-lab-values",
    regex: /\b(Hb|CBC|TLC|DLC|ESR|RBS|BSL|FBS|PPBS|HbA1c|Serum\s+[A-Za-z]+|Blood\s+(?:Sugar|Glucose|Urea|Creatinine|Uric\s+Acid)|LFT|KFT|RFT|TSH|T3|T4|FT3|FT4|Lipid\s+Profile|S\.Ca|S\.Na|S\.K|PT|aPTT|INR|AFP|CEA|PSA|HIV|HBsAg|HCV|VDRL|Widal|Dengue|COVID|Urine\s+[A-Za-z]+|ECG|Chest\s+X-?ray|USG|Ultrasound|CT\s+[Ss]can|MRI|Mammography)\s*[:\-–]?\s*((?:[0-9][0-9.,\/]*(?:\s*[a-zA-Z%\/µ<>]+)?|[A-Za-z][^\n.;]{0,40}))/gi,
    baseConfidence: 0.6,
    toValue: (m) => ({
      name: m[1].trim(),
      value: m[2]?.trim() || undefined,
    }),
    uncertaintyNote: "Extracted from OCR text. Doctor review required.",
  },

  /* ---- PROCEDURE ---- */
  {
    category: "PROCEDURE",
    id: "procedure-marker",
    regex: /(?:Procedure[s]?|Surgery|Operated|Underwent|Surgical(?:ly)?|Intervention)\s*[:\-–]?\s*([A-Za-z][A-Za-z ]{1,80}?)(?=\.|;|\n|$)/gi,
    baseConfidence: 0.6,
    toValue: (m) => ({
      details: m[1].trim(),
    }),
    uncertaintyNote: "Extracted from OCR text. Doctor review required.",
  },

  /* ---- ALLERGY ---- */
  {
    category: "ALLERGY",
    id: "allergy-marker",
    regex: /(?:Allerg(?:y|ies|ic|ies\s+to)?|Hypersensitiv(?:e|ity)\s+to|Drug\s+allergy|ADR)\s*[:\-–]?\s*([A-Za-z][A-Za-z0-9 ,\-]{1,60}?)(?=\.|;|\n|$)/gi,
    baseConfidence: 0.6,
    toValue: (m) => ({
      name: m[1].trim(),
    }),
    uncertaintyNote: "Extracted from OCR text. Doctor review required.",
  },

  /* ---- MEDICAL HISTORY (explicit statements only) ---- */
  {
    category: "MEDICAL_HISTORY",
    id: "medical-history-marker",
    regex: /(?:Past\s+medical\s+history|Medical\s+history|History\s+of|Comorbidit(?:y|ies)|Known\s+case\s+of|H\/O)\s*[:\-–]?\s*([^\n.;]{2,120})/gi,
    baseConfidence: 0.55,
    toValue: (m) => ({
      details: m[1].trim(),
    }),
    uncertaintyNote: "Extracted from OCR text. Doctor review required.",
  },

  /* ---- CHRONOLOGY ---- */
  {
    category: "CHRONOLOGY",
    id: "chronology-date",
    regex: /(?:On|Dated|Date)\s*[:\-–]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?,?\s+\d{4})/gi,
    baseConfidence: 0.7,
    toValue: (m) => ({
      date: m[1].trim(),
    }),
  },
  {
    category: "CHRONOLOGY",
    id: "chronology-duration",
    regex: /\b(since|for|from|over|ago)\s+(\d+\s*(?:days?|weeks?|months?|years?|hours?))\b/gi,
    baseConfidence: 0.6,
    toValue: (m) => ({
      details: `${m[1].toLowerCase()} ${m[2]}`,
    }),
  },
];

/* ------------------------------------------------------------------ */
/*  Core extraction function                                           */
/* ------------------------------------------------------------------ */

const MAX_ITEMS_PER_PAGE = 30;
const MAX_ITEMS_TOTAL = 60;

/**
 * Run deterministic extraction across OCR pages.
 * Returns extracted evidence items, all with UNVERIFIED verification state.
 *
 * Items are deduplicated by (category, pageNumber, normalizedValue hash).
 */
export function extractDeterministicEvidence(
  pages: OcrPageInput[],
  providerMeta: ExtractionProviderMetadata,
  documentId: string,
  sessionId: string,
): ExtractedEvidenceItem[] {
  const seen = new Set<string>();
  const items: ExtractedEvidenceItem[] = [];

  for (const page of pages) {
    const text = page.extractedText;
    if (!text) continue;

    let pageCount = 0;

    for (const rule of EXTRACTION_RULES) {
      // Reset regex lastIndex for each page (global flag)
      rule.regex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = rule.regex.exec(text)) !== null) {
        if (pageCount >= MAX_ITEMS_PER_PAGE) break;

        const wording = match[0].trim().slice(0, 500);
        if (wording.length === 0) continue;

        const normalizedValue = rule.toValue(match, text);

        // Deduplication key: category + page + normalized value summary
        const valueHash = JSON.stringify(normalizedValue);
        const dedupKey = `${rule.category}:${page.pageNumber}:${valueHash}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        const ocrSpan: OcrSpan | undefined = match.index >= 0
          ? {
              start: match.index,
              end: match.index + match[0].length,
            }
          : undefined;

        const item = createUnverifiedEvidenceItem({
          documentId,
          sessionId,
          category: rule.category,
          normalizedValue,
          originalOcrWording: wording,
          pageNumber: page.pageNumber,
          ocrSpan,
          extractionMethod: "DETERMINISTIC",
          provider: providerMeta,
          confidence: rule.baseConfidence,
          uncertaintyNotes: rule.uncertaintyNote,
        });

        items.push(item);
        pageCount++;

        if (items.length >= MAX_ITEMS_TOTAL) return items;
      }
    }
  }

  return items;
}

/* ------------------------------------------------------------------ */
/*  Contradiction detection                                            */
/* ------------------------------------------------------------------ */

function normalizeMedicationName(name: string | undefined): string {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
}

function contradictionKey(item: ExtractedEvidenceItem): string | null {
  switch (item.category) {
    case "MEDICATION":
      return normalizeMedicationName(item.normalizedValue.name);
    case "INVESTIGATION":
      return (item.normalizedValue.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    default:
      return null;
  }
}

function secondaryValue(item: ExtractedEvidenceItem): string {
  switch (item.category) {
    case "MEDICATION":
      return item.normalizedValue.dose ?? "";
    case "INVESTIGATION":
      return item.normalizedValue.value ?? "";
    default:
      return item.normalizedValue.details ?? item.normalizedValue.date ?? "";
  }
}

/**
 * Detect contradictions among extracted items.
 *
 * For items in the same category with the same primary key but different
 * secondary values, assign a shared contradictionGroupId and add
 * uncertainty notes.
 *
 * This function mutates items in place (assigns contradictionGroupId
 * and appends to uncertaintyNotes).
 */
export function detectContradictions(
  items: ExtractedEvidenceItem[],
): ExtractedEvidenceItem[] {
  const buckets = new Map<string, ExtractedEvidenceItem[]>();

  for (const item of items) {
    const key = contradictionKey(item);
    if (!key) continue;

    const group = buckets.get(key) ?? [];
    group.push(item);
    buckets.set(key, group);
  }

  for (const [, group] of buckets) {
    if (group.length < 2) continue;

    // Group items by secondary value
    const bySecondary = new Map<string, ExtractedEvidenceItem[]>();
    for (const item of group) {
      const sv = secondaryValue(item);
      const existing = bySecondary.get(sv) ?? [];
      existing.push(item);
      bySecondary.set(sv, existing);
    }

    // If all secondary values are the same, no contradiction
    if (bySecondary.size <= 1) continue;

    // Assign a shared contradictionGroupId to all items in this bucket
    const groupId = crypto.randomUUID();
    for (const item of group) {
      item.contradictionGroupId = groupId;
      const existingNote = item.uncertaintyNotes;
      const conflictNote = `Possible contradiction within ${item.category} records`;
      item.uncertaintyNotes = existingNote
        ? `${existingNote}. ${conflictNote}`
        : conflictNote;
    }
  }

  return items;
}

/* ------------------------------------------------------------------ */
/*  Provider metadata                                                  */
/* ------------------------------------------------------------------ */

export const DETERMINISTIC_PROVIDER: ExtractionProviderMetadata = {
  name: "deterministic",
  createdAt: new Date().toISOString(),
};
