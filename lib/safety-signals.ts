import { Severity, severityRank } from "./case-status";

/**
 * Deterministic safety-signal (red-flag) detection.
 *
 * Safety signals are REVIEW ORIENTED, never diagnoses. Every signal states
 * what was observed, why it was flagged, and where it came from. The engine
 * uses bounded keyword heuristics plus severity/region context; it never
 * infers conditions from absent answers, and it never converts UNKNOWN /
 * DECLINED / NOT_ASKED states into findings.
 *
 * Multilingual keyword coverage is intentionally conservative: only terms
 * that are stable, high-confidence translations in each language are used.
 * English terms always apply (kiosk documents and interview free-text are
 * frequently mixed-language).
 */

export type SafetySignalDraft = {
  type: string;
  summary: string; // patient-facing plain language
  reason: string; // physician-facing explanation
  evidenceRef: string;
  source: "PATIENT" | "OCR";
};

export type SignalInputComplaint = {
  text: string;
  region: string | null;
  severity: Severity | null;
  position: number;
};

export type SignalInputFact = {
  questionId: string;
  value?: string | null;
  state: string;
};

export type SignalInputEvidence = {
  id: string;
  category: string;
  primaryValue: string;
  detail?: string | null;
};

export type SignalInput = {
  complaints: SignalInputComplaint[];
  facts: SignalInputFact[]; // global + HPI interview facts
  evidence: SignalInputEvidence[];
};

type KeywordSet = string[];

// Conservative, high-confidence terms only. Every non-English entry is a
// well-established word or phrase in that language; if a term is not
// confident it is omitted (the engine is a review aid, not a diagnosis).
const K = {
  chestPain: [
    "chest pain", "chest tightness", "chest pressure",
    "सीने में दर्द", "सीने का दर्द",
    "বুক ব্যথা", "চেস্ট পেইন",
    "తిని వేదన",
    "திடக்கு வலி", "இதய வலி",
    "सातव्यात", "साता येणे",
  ] as KeywordSet,
  breathing: [
    "breathless", "breathing difficult", "cannot breathe", "difficulty breathing",
    "साँस लेने में दिक्कत",
    "শ্বাস নিতে সমস্যা",
    "శ్వాస తీసుకోవడంలో ఇబ్బంది",
    "சுவாசம் எடுக்க கஷ்டம்",
    "सास पुरी न होणे",
  ] as KeywordSet,
  blood: [
    "blood", "coughing blood", "vomiting blood",
    "खून", "रक्त",
    "রক্ত",
    "రక్తం",
    "இரத்தம்",
    "रक्त", "खून",
  ] as KeywordSet,
  fainting: [
    "fainted", "fainting", "lost consciousness", "unconscious",
    "होश खोना", "गिर पड़ना", "होश गया",
    "অজ্ঞান",
    "అజ్ఞాన స్థితి",
    "வழுக்க",
    "होश गेला", "असमज",
  ] as KeywordSet,
  seizure: [
    "seizure", "convulsion", "fit",
    "चाल पड़ना", "फिट पड़ना",
    "আমাবাস", "ফিট",
    "ఫిట్",
    "நடுக்கம்",
    "फिट", "चाल",
  ] as KeywordSet,
  neuro: [
    "slurred speech", "slurred", "weakness on one", "face droop", "worst headache", "sudden severe headache",
    "अधेरा मुँह", "एक तरफ कमजोरी",
    "এক পাশে দুর্বলতা",
    "ఒక వైపు బలహీనత",
    "ஒரு பக்கம் தளர்வு",
    "एक बाजूला कमजोरी",
  ] as KeywordSet,
  headTrauma: [
    "fell on my head", "fell and hit", "hit my head", "head injury", "head wound",
    "bumped my head", "injury to my head", "bleeding from my head", "cut on my head", "head strike",
    "गिरकर सिर", "सिर पर गिरा", "सिर चोट", "सिर पर धक्का", "सिर पर आघात",
    "পড়ে মাথায়", "মাথায় আঘাত", "মাথায় ধাক্কা", "মাথা কেটে",
    "పడి తల", "తలకు గాయం", "తల కొట్టుకుంది", "తలపై ధోకా",
    "படி தலையில்", "தலையில் காயம்", "தலையில் இடி", "தலையில் வெட்டு",
    "पडून डोक्याला", "डोक्याला घायाळ", "डोक्यावर धक्का", "डोक्याला जखम",
  ] as KeywordSet,
  abdominal: [
    "stomach pain", "belly pain", "severe stomach",
    "पेट में दर्द",
    "পেটে ব্যথা",
    "పెదడు వేదన",
    "பெல்லி வலி", "வயிற்று வலி",
    "पोटाची वेदना",
  ] as KeywordSet,
  vomitingDiarrhea: [
    "vomiting", "vomit", "diarrhoea", "diarrhea",
    "उल्टी", "दस्त",
    "বমি", "ডায়রিয়া",
    "వాంతి",
    "வாய் கெட்டு", "மலச்சரவு",
    "उलटी", "दस्त",
  ] as KeywordSet,
  selfHarm: [
    "hurt myself", "self harm", "self-harm", "suicide", "end my life",
    "आत्महत्या",
    "আত্মহত্যা",
    "స్వయం హత్య",
    "தற்கொலை",
    "आत्महत्या",
  ] as KeywordSet,
};

function matchesAny(text: string, terms: KeywordSet): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function textOfComplaints(input: SignalInput): string {
  return input.complaints.map((c) => c.text).join(" \n ");
}

function textOfFacts(input: SignalInput): string {
  // Only KNOWN facts with a value contribute text. UNKNOWN/DECLINED/DENIED
  // never become findings.
  return input.facts
    .filter((f) => f.state === "KNOWN" && f.value)
    .map((f) => `${f.questionId}: ${f.value}`)
    .join(" \n ");
}

/**
 * Evaluate the canonical inputs and return deduplicated signal drafts.
 * Pure function: no I/O, no randomness, fully testable.
 */
export function detectSafetySignals(input: SignalInput): SafetySignalDraft[] {
  const drafts: SafetySignalDraft[] = [];
  const seen = new Set<string>();
  const add = (draft: SafetySignalDraft) => {
    const key = `${draft.type}:${draft.evidenceRef}`;
    if (!seen.has(key)) {
      seen.add(key);
      drafts.push(draft);
    }
  };

  const complaintText = textOfComplaints(input);
  const factText = textOfFacts(input);
  const allText = `${complaintText}\n${factText}`;

  // 1. Chest pain (region match or explicit descriptors).
  const chestComplaint = input.complaints.find(
    (c) => c.region === "chest" || matchesAny(c.text, K.chestPain),
  );
  if (chestComplaint) {
    const concerningSeverity =
      chestComplaint.severity && severityRank[chestComplaint.severity] >= 3;
    add({
      type: "CHEST_PAIN_URGENT",
      summary: "You told us about chest pain. This is being checked by the doctor first.",
      reason: `Chest pain reported (complaint #${chestComplaint.position})${
        concerningSeverity ? ` with ${chestComplaint.severity} severity` : ""
      }. Cardiac and respiratory causes require physician assessment.`,
      evidenceRef: `complaint:${chestComplaint.position}`,
      source: "PATIENT",
    });
  }

  // 2. Breathlessness reported anywhere in KNOWN patient text.
  if (matchesAny(allText, K.breathing)) {
    const ref = matchesAny(complaintText, K.breathing)
      ? `complaint:${input.complaints[0]?.position ?? 1}`
      : "interview:ros";
    add({
      type: "BREATHLESSNESS",
      summary: "You told us about breathing difficulty. The doctor will look at this carefully.",
      reason: "Patient reports breathlessness / difficulty breathing. Respiratory assessment indicated.",
      evidenceRef: ref,
      source: "PATIENT",
    });
  }

  // 3. Possible haemoptysis or GI bleeding.
  if (matchesAny(allText, K.blood)) {
    add({
      type: "BLEEDING_REPORTED",
      summary: "You mentioned seeing blood. The doctor will want to check this today.",
      reason: "Patient text mentions blood (possible haemoptysis or haematemesis). Source text requires clinical correlation.",
      evidenceRef: matchesAny(complaintText, K.blood) ? "complaint" : "interview",
      source: "PATIENT",
    });
  }

  // 4. Neurological / stroke-like descriptors or loss of consciousness.
  if (matchesAny(allText, K.neuro) || matchesAny(allText, K.fainting) || matchesAny(allText, K.seizure)) {
    add({
      type: "NEUROLOGICAL",
      summary: "You described symptoms that can need urgent attention. The doctor will review this first.",
      reason: "Patient text contains neurological descriptors (focal weakness, slurred speech, convulsion, loss of consciousness). Time-sensitive assessment indicated.",
      evidenceRef: "interview",
      source: "PATIENT",
    });
  }

  // 4b. Head trauma (fall or impact on the head) — intracranial injury risk.
  if (matchesAny(allText, K.headTrauma)) {
    const ref = matchesAny(complaintText, K.headTrauma)
      ? `complaint:${input.complaints[0]?.position ?? 1}`
      : "interview";
    add({
      type: "HEAD_TRAUMA",
      summary: "You told us about an injury to your head. This is being checked by the doctor first.",
      reason: "Patient text reports a head injury (fall or impact on the head). Risk of intracranial injury requires physician assessment.",
      evidenceRef: ref,
      source: "PATIENT",
    });
  }

  // 5. Severe abdominal presentation (pain + vomiting/diarrhea or high severity).
  const abdoComplaint = input.complaints.find((c) => c.region === "abdomen" || matchesAny(c.text, K.abdominal));
  if (abdoComplaint) {
    const withVomiting = matchesAny(allText, K.vomitingDiarrhea);
    const highSeverity = abdoComplaint.severity && severityRank[abdoComplaint.severity] >= 3;
    if (withVomiting || highSeverity) {
      add({
        type: "ABDOMINAL_URGENT",
        summary: "You told us about strong stomach pain. The doctor will check this carefully.",
        reason: `Abdominal pain reported (complaint #${abdoComplaint.position})${
          withVomiting ? " with vomiting/diarrhoea" : ""
        }${highSeverity ? ` at ${abdoComplaint.severity} severity` : ""}. Acute abdomen must be excluded by examination.`,
        evidenceRef: `complaint:${abdoComplaint.position}`,
        source: "PATIENT",
      });
    }
  }

  // 6. Self-harm ideation — highest-priority escalation.
  if (matchesAny(allText, K.selfHarm)) {
    add({
      type: "SELF_HARM",
      summary: "Thank you for telling us. A team member will check on you right away.",
      reason: "Patient text indicates possible self-harm ideation. Immediate human support required; clinical and psychosocial assessment indicated.",
      evidenceRef: "interview",
      source: "PATIENT",
    });
  }

  // 7. Any VERY_SEVERE complaint.
  for (const complaint of input.complaints) {
    if (complaint.severity === "VERY_SEVERE") {
      add({
        type: "SEVERE_PRESENTATION",
        summary: `You rated “${complaint.text || "your problem"}” as very severe. The doctor will see you soon.`,
        reason: `Complaint #${complaint.position} self-rated VERY_SEVERE by the patient. Triage priority elevated pending physician assessment.`,
        evidenceRef: `complaint:${complaint.position}`,
        source: "PATIENT",
      });
    }
  }

  // 8. Document evidence naming conditions that generally need prompt review.
  const criticalDiagnosisTerms = [
    "fracture", "stroke", "heart attack", "myocardial", "pneumonia", "epilepsy",
    "diabetes", "hypertension", "tuberculosis", "cancer", "tumour", "tumor",
    "asthma", "heart failure", "anemia", "anaemia",
  ];
  for (const item of input.evidence) {
    if (item.category !== "DIAGNOSIS" && item.category !== "MEDICAL_HISTORY") continue;
    const text = `${item.primaryValue} ${item.detail ?? ""}`.toLowerCase();
    if (criticalDiagnosisTerms.some((t) => text.includes(t))) {
      add({
        type: "CRITICAL_CONDITION_DOCUMENTED",
        summary: "One of your documents mentions a condition. The doctor will review it with you.",
        reason: `Document evidence (${item.category}) names "${item.primaryValue}". Condition may require prompt or coordinated attention; physician to confirm relevance.`,
        evidenceRef: `evidence:${item.id}`,
        source: "OCR",
      });
    }
  }

  return drafts;
}

export function dedupeSignals(existing: Array<{ type: string; evidenceRef: string | null }>, drafts: SafetySignalDraft[]) {
  const existingKeys = new Set(existing.map((s) => `${s.type}:${s.evidenceRef ?? ""}`));
  return drafts.filter((d) => !existingKeys.has(`${d.type}:${d.evidenceRef}`));
}
