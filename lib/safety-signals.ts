export type SafetySignal = { type: string; summary: string; reason: string; source: "PATIENT" | "DOCUMENT" | "SYSTEM" };
const RULES = [
  { type: "CARDIO_RESPIRATORY", test: /(chest pain|chest pressure).*(breath|dyspn)|breath.*(chest pain|pressure)/i, summary: "Chest symptoms with breathing difficulty require urgent physician assessment." },
  { type: "STROKE_NEURO", test: /(face droop|slurred speech|one-sided weakness|sudden weakness)/i, summary: "Possible acute neurological warning symptoms require urgent physician assessment." },
  { type: "SEVERE_BLEEDING", test: /(vomiting blood|blood in vomit|heavy bleeding|uncontrolled bleeding)/i, summary: "Reported significant bleeding requires urgent physician assessment." },
  { type: "LOSS_OF_CONSCIOUSNESS", test: /(fainted|unconscious|loss of consciousness|not waking)/i, summary: "Loss of consciousness requires urgent physician assessment." }
];
export function detectSafetySignals(texts: string[]): SafetySignal[] {
  const joined = texts.filter(Boolean).join(" ");
  return RULES.filter(r => r.test.test(joined)).map(r => ({ type: r.type, summary: r.summary, reason: "Deterministic red-flag rule matched patient-provided text.", source: "PATIENT" }));
}
