import React from "react";

export const DASHAVIDHA_META: Record<
  string,
  {
    sanskrit: string;
    english: string;
    clinicalFocus: string;
    themeColor: string;
    bgGradient: string;
    accentColor: string;
  }
> = {
  prakriti: {
    sanskrit: "प्रकृति (Prakrīti)",
    english: "Baseline Constitution",
    clinicalFocus: "Genetic and constitutional doshic baseline (Vata, Pitta, Kapha).",
    themeColor: "#0b5d4b",
    bgGradient: "linear-gradient(135deg, #e6f4f0 0%, #d1ebe3 100%)",
    accentColor: "#0d6e59",
  },
  vikriti: {
    sanskrit: "विकृति (Vikrīti)",
    english: "Current Imbalance / Morbidity",
    clinicalFocus: "Active pathological deviation from baseline homeostasis.",
    themeColor: "#c2410c",
    bgGradient: "linear-gradient(135deg, #fef3c7 0%, #ffedd5 100%)",
    accentColor: "#ea580c",
  },
  sara: {
    sanskrit: "सार (Sāra)",
    english: "Tissue Excellence / Dhatus",
    clinicalFocus: "Constitutional quality of 7 primary tissue elements and Ojas.",
    themeColor: "#0f766e",
    bgGradient: "linear-gradient(135deg, #e0f2fe 0%, #ccfbf1 100%)",
    accentColor: "#0d9488",
  },
  samhanana: {
    sanskrit: "संहनन (Saṃhanana)",
    english: "Body Compactness & Symmetry",
    clinicalFocus: "Musculoskeletal density, structural firmness, and bone compactness.",
    themeColor: "#1e3a8a",
    bgGradient: "linear-gradient(135deg, #ede9fe 0%, #e0e7ff 100%)",
    accentColor: "#3b82f6",
  },
  pramana: {
    sanskrit: "प्रमाण (Pramāṇa)",
    english: "Body Proportions & Metrics",
    clinicalFocus: "Anthropometric harmony, stature, and proportional measurements.",
    themeColor: "#4338ca",
    bgGradient: "linear-gradient(135deg, #f3e8ff 0%, #e0e7ff 100%)",
    accentColor: "#6366f1",
  },
  satmya: {
    sanskrit: "सात्म्य (Sātmya)",
    english: "Adaptability & Homologation",
    clinicalFocus: "Tolerance, resilience, habituation to diet, climate, and herbs.",
    themeColor: "#15803d",
    bgGradient: "linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)",
    accentColor: "#16a34a",
  },
  sattva: {
    sanskrit: "सत्त्व (Sattva)",
    english: "Mental Strength & Psyche",
    clinicalFocus: "Psychological resilience, cognitive clarity, and emotional equilibrium.",
    themeColor: "#6d28d9",
    bgGradient: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
    accentColor: "#7c3aed",
  },
  ahara_shakti: {
    sanskrit: "आहारशक्ति (Āhāra Śakti)",
    english: "Digestive Capacity (Agni)",
    clinicalFocus: "Capacity for appetite, digestion, metabolism, and assimilation.",
    themeColor: "#b45309",
    bgGradient: "linear-gradient(135deg, #ffedd5 0%, #fef3c7 100%)",
    accentColor: "#f59e0b",
  },
  vyayama_shakti: {
    sanskrit: "व्यायामशक्ति (Vyāyāma Śakti)",
    english: "Physical & Exercise Endurance",
    clinicalFocus: "Cardiorespiratory stamina, muscular capacity, and work tolerance.",
    themeColor: "#0284c7",
    bgGradient: "linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)",
    accentColor: "#0ea5e9",
  },
  vaya: {
    sanskrit: "वय (Vaya)",
    english: "Chronological Age & Life Stage",
    clinicalFocus: "Lifespan phase: Bala (Childhood), Madhya (Adult), or Vardhakya (Senior).",
    themeColor: "#78350f",
    bgGradient: "linear-gradient(135deg, #fef9c3 0%, #fef3c7 100%)",
    accentColor: "#d97706",
  },
};

export function DashavidhaIcon({
  name,
  size = 48,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const meta = DASHAVIDHA_META[name] ?? {
    themeColor: "#0b5d4b",
    accentColor: "#0d6e59",
  };

  switch (name) {
    case "prakriti":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-hidden="true"
        >
          <circle cx="24" cy="24" r="22" fill={meta.themeColor} fillOpacity="0.12" stroke={meta.themeColor} strokeWidth="1.5" />
          <circle cx="24" cy="24" r="17" stroke={meta.accentColor} strokeWidth="1" strokeDasharray="3 3" />
          <path
            d="M24 10C27 16 32 20 37 20C32 25 27 25 24 38C21 25 16 25 11 20C16 20 21 16 24 10Z"
            fill={meta.accentColor}
            fillOpacity="0.8"
          />
          <circle cx="24" cy="24" r="4.5" fill="#ffffff" stroke={meta.themeColor} strokeWidth="1.5" />
          <circle cx="24" cy="24" r="2" fill={meta.themeColor} />
          <circle cx="24" cy="14" r="1.5" fill={meta.themeColor} />
          <circle cx="32" cy="28" r="1.5" fill={meta.themeColor} />
          <circle cx="16" cy="28" r="1.5" fill={meta.themeColor} />
        </svg>
      );

    case "vikriti":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-hidden="true"
        >
          <circle cx="24" cy="24" r="22" fill={meta.themeColor} fillOpacity="0.12" stroke={meta.themeColor} strokeWidth="1.5" />
          <path d="M12 28L24 22L36 16" stroke={meta.themeColor} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M24 22V36" stroke={meta.themeColor} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M18 36H30" stroke={meta.themeColor} strokeWidth="2" strokeLinecap="round" />
          <path d="M12 28V31M9 31H15" stroke={meta.accentColor} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12" cy="33" r="2" fill={meta.accentColor} />
          <path d="M36 16V19M33 19H39" stroke={meta.accentColor} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="36" cy="21" r="2" fill={meta.accentColor} />
          <path
            d="M10 16L17 16L20 11L24 20L28 14L31 16L38 16"
            stroke="#ea580c"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "sara":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-hidden="true"
        >
          <circle cx="24" cy="24" r="22" fill={meta.themeColor} fillOpacity="0.12" stroke={meta.themeColor} strokeWidth="1.5" />
          <path
            d="M24 35C18 35 13 30 13 25C17 25 21 28 24 35Z"
            fill={meta.accentColor}
            fillOpacity="0.6"
          />
          <path
            d="M24 35C30 35 35 30 35 25C31 25 27 28 24 35Z"
            fill={meta.accentColor}
            fillOpacity="0.6"
          />
          <path
            d="M24 35C20 28 20 20 24 13C28 20 28 28 24 35Z"
            fill={meta.themeColor}
            fillOpacity="0.8"
          />
          <polygon points="24,18 29,24 24,30 19,24" fill="#ffffff" stroke={meta.themeColor} strokeWidth="1.5" />
          <circle cx="24" cy="24" r="2" fill={meta.accentColor} />
          <circle cx="24" cy="9" r="1.5" fill={meta.accentColor} />
          <circle cx="13" cy="18" r="1.2" fill={meta.accentColor} />
          <circle cx="35" cy="18" r="1.2" fill={meta.accentColor} />
        </svg>
      );

    case "samhanana":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-hidden="true"
        >
          <circle cx="24" cy="24" r="22" fill={meta.themeColor} fillOpacity="0.12" stroke={meta.themeColor} strokeWidth="1.5" />
          <path
            d="M17 14C17 14 24 12 31 14C32 20 33 28 24 36C15 28 16 20 17 14Z"
            fill={meta.themeColor}
            fillOpacity="0.2"
            stroke={meta.themeColor}
            strokeWidth="2"
          />
          <line x1="24" y1="14" x2="24" y2="33" stroke={meta.themeColor} strokeWidth="2" strokeLinecap="round" />
          <path d="M19 20C21 21 23 21 24 21C25 21 27 21 29 20" stroke={meta.accentColor} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M18 25C21 26 23 26 24 26C25 26 27 26 30 25" stroke={meta.accentColor} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M20 29C22 30 23 30 24 30C25 30 26 30 28 29" stroke={meta.accentColor} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="24" cy="9.5" r="3.5" fill={meta.themeColor} />
        </svg>
      );

    case "pramana":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-hidden="true"
        >
          <circle cx="24" cy="24" r="22" fill={meta.themeColor} fillOpacity="0.12" stroke={meta.themeColor} strokeWidth="1.5" />
          <circle cx="24" cy="14" r="3" fill="#ffffff" stroke={meta.themeColor} strokeWidth="2" />
          <path d="M22 16L14 34" stroke={meta.themeColor} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M26 16L34 34" stroke={meta.themeColor} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M16 28C20 25 28 25 32 28" stroke={meta.accentColor} strokeWidth="1.5" strokeDasharray="2 2" />
          <line x1="16" y1="29" x2="19" y2="29" stroke={meta.accentColor} strokeWidth="1.5" />
          <line x1="29" y1="29" x2="32" y2="29" stroke={meta.accentColor} strokeWidth="1.5" />
          <line x1="24" y1="22" x2="24" y2="35" stroke={meta.accentColor} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="14" cy="34" r="1.8" fill={meta.accentColor} />
          <circle cx="34" cy="34" r="1.8" fill={meta.accentColor} />
        </svg>
      );

    case "satmya":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-hidden="true"
        >
          <circle cx="24" cy="24" r="22" fill={meta.themeColor} fillOpacity="0.12" stroke={meta.themeColor} strokeWidth="1.5" />
          <path
            d="M24 8C31 11 36 14 36 24C36 32 29 38 24 40C19 38 12 32 12 24C12 14 17 11 24 8Z"
            stroke={meta.themeColor}
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />
          <path
            d="M24 14C17 17 16 26 24 32C32 26 31 17 24 14Z"
            fill={meta.accentColor}
            fillOpacity="0.75"
          />
          <path d="M24 14V32" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M24 20L20 23" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M24 22L28 25" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M24 26L21 28" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );

    case "sattva":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-hidden="true"
        >
          <circle cx="24" cy="24" r="22" fill={meta.themeColor} fillOpacity="0.12" stroke={meta.themeColor} strokeWidth="1.5" />
          <circle cx="24" cy="17" r="7" fill={meta.accentColor} fillOpacity="0.25" stroke={meta.themeColor} strokeWidth="1.5" />
          <circle cx="24" cy="17" r="2" fill="#ffffff" stroke={meta.themeColor} strokeWidth="1.5" />
          <path d="M14 17C14 11.5 18.5 7 24 7C29.5 7 34 11.5 34 17" stroke={meta.accentColor} strokeWidth="1.4" strokeDasharray="2 2" />
          <path d="M10 17C10 9 16 3 24 3C32 3 38 9 38 17" stroke={meta.accentColor} strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
          <path
            d="M15 37C15 31 19 28 24 28C29 28 33 31 33 37"
            stroke={meta.themeColor}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M12 37H36" stroke={meta.themeColor} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );

    case "ahara_shakti":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-hidden="true"
        >
          <circle cx="24" cy="24" r="22" fill={meta.themeColor} fillOpacity="0.12" stroke={meta.themeColor} strokeWidth="1.5" />
          <path
            d="M13 28C13 34 18 37 24 37C30 37 35 34 35 28H13Z"
            fill={meta.themeColor}
            fillOpacity="0.75"
          />
          <path d="M11 28H37" stroke={meta.themeColor} strokeWidth="2" strokeLinecap="round" />
          <path d="M19 37L17 40H31L29 37" stroke={meta.themeColor} strokeWidth="1.8" />
          <path
            d="M24 10C24 10 28 15 28 19C28 23 25 25 24 25C23 25 20 23 20 19C20 15 24 10 24 10Z"
            fill={meta.accentColor}
          />
          <path
            d="M24 16C24 16 26 19 26 21C26 23 25 24 24 24C23 24 22 23 22 21C22 19 24 16 24 16Z"
            fill="#fef08a"
          />
          <circle cx="29" cy="14" r="1.3" fill={meta.accentColor} />
          <circle cx="19" cy="14" r="1.3" fill={meta.accentColor} />
        </svg>
      );

    case "vyayama_shakti":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-hidden="true"
        >
          <circle cx="24" cy="24" r="22" fill={meta.themeColor} fillOpacity="0.12" stroke={meta.themeColor} strokeWidth="1.5" />
          <circle cx="30" cy="12" r="3.2" fill={meta.themeColor} />
          <path
            d="M27 16L22 23L16 22M22 23L26 29L32 30M22 23L20 31L13 36M26 29L28 38"
            stroke={meta.themeColor}
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10 16C14 16 16 18 19 18M9 20C12 20 14 22 17 22"
            stroke={meta.accentColor}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path d="M12 40H36" stroke={meta.accentColor} strokeWidth="1.8" strokeLinecap="round" strokeDasharray="4 3" />
        </svg>
      );

    case "vaya":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-hidden="true"
        >
          <circle cx="24" cy="24" r="22" fill={meta.themeColor} fillOpacity="0.12" stroke={meta.themeColor} strokeWidth="1.5" />
          <path
            d="M11 32C11 22 17 14 24 14C31 14 37 22 37 32"
            stroke={meta.themeColor}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="30" r="3" fill="#ffffff" stroke={meta.accentColor} strokeWidth="1.8" />
          <circle cx="12" cy="30" r="1.5" fill={meta.accentColor} />
          <circle cx="24" cy="14" r="4" fill={meta.accentColor} stroke="#ffffff" strokeWidth="1.5" />
          <circle cx="36" cy="30" r="3" fill="#ffffff" stroke={meta.themeColor} strokeWidth="1.8" />
          <circle cx="36" cy="30" r="1.5" fill={meta.themeColor} />
          <line x1="8" y1="36" x2="40" y2="36" stroke={meta.themeColor} strokeWidth="2" strokeLinecap="round" />
          <line x1="24" y1="36" x2="24" y2="22" stroke={meta.accentColor} strokeWidth="2" strokeLinecap="round" />
          <circle cx="24" cy="36" r="2.5" fill={meta.themeColor} />
        </svg>
      );

    default:
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-hidden="true"
        >
          <circle cx="24" cy="24" r="22" fill="#0b5d4b" fillOpacity="0.1" stroke="#0b5d4b" strokeWidth="1.5" />
          <circle cx="24" cy="24" r="6" fill="#0b5d4b" />
        </svg>
      );
  }
}
