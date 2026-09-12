import type { InterviewFact, InterviewState } from "./patient-flow";
export type InterviewQuestion = { id: string; label: string; type: "yes_no" | "free_text" | "numeric"; domain: string; redFlag?: boolean };
export const QUESTIONS: InterviewQuestion[] = [
  { id: "onset", label: "When did this problem start?", type: "free_text", domain: "HPI" },
  { id: "progression", label: "Has it become better, worse or stayed the same?", type: "free_text", domain: "HPI" },
  { id: "breathlessness", label: "Are you having difficulty breathing?", type: "yes_no", domain: "ROS", redFlag: true },
  { id: "chest_pain", label: "Are you having chest pain or pressure?", type: "yes_no", domain: "ROS", redFlag: true },
  { id: "past_history", label: "Do you have any important past medical or surgical history?", type: "free_text", domain: "PAST_HISTORY" },
  { id: "medicines", label: "Are you taking any medicines regularly?", type: "free_text", domain: "DRUG_HISTORY" },
  { id: "allergies", label: "Do you have any known medicine or food allergies?", type: "free_text", domain: "ALLERGY" },
  { id: "family_history", label: "Any important illnesses in your close family?", type: "free_text", domain: "FAMILY_HISTORY" },
  { id: "diet_lifestyle", label: "Anything important about your diet, sleep, tobacco, alcohol or daily routine?", type: "free_text", domain: "PERSONAL_HISTORY" }
];
export function nextQuestion(facts: Record<string, InterviewFact>) { return QUESTIONS.find(q => !facts[q.id] || facts[q.id].state === "NOT_ASKED") ?? null; }
export function stateForYesNo(value: string): InterviewState {
  const v = value.trim().toLowerCase();
  if (["yes","y","haan","ha","हाँ","होय","avunu","ஆம்"].includes(v)) return "KNOWN";
  if (["no","n","nahi","नहीं","না","లేదు","இல்லை","नाही"].includes(v)) return "DENIED";
  if (["skip","prefer not to answer","i prefer not to answer","decline","don't want to answer","do not want to answer","nahi batana","नहीं बताना"].includes(v)) return "DECLINED";
  return "UNKNOWN";
}
