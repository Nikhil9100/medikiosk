export const DASHAVIDHA_KEYS = ["prakriti","vikriti","sara","samhanana","pramana","satmya","sattva","ahara_shakti","vyayama_shakti","vaya"] as const;
export const DASHAVIDHA = [
  ["prakriti", "Prakriti", "Baseline constitution"],
  ["vikriti", "Vikriti", "Current imbalance / deviation"],
  ["sara", "Sara", "Tissue excellence"],
  ["samhanana", "Samhanana", "Body compactness / build"],
  ["pramana", "Pramana", "Body proportions / measurements"],
  ["satmya", "Satmya", "Adaptability / suitability"],
  ["sattva", "Sattva", "Mental strength"],
  ["ahara_shakti", "Ahara Shakti", "Capacity for food intake and digestion"],
  ["vyayama_shakti", "Vyayama Shakti", "Exercise capacity"],
  ["vaya", "Vaya", "Age / life stage"]
] as const;
export type DashavidhaKey = (typeof DASHAVIDHA_KEYS)[number];
export type DashavidhaState = "NOT_ASSESSED" | "OBSERVED" | "NOT_APPLICABLE";
