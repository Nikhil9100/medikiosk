import { z } from "zod";

export const ClinicalAnswerState = z.enum([
  "NOT_ASKED",
  "KNOWN",
  "UNKNOWN",
  "DECLINED",
  "DENIED",
]);

export const ClinicalProvenance = z.enum([
  "PATIENT",
  "VOICE",
  "TOUCH",
  "OCR",
  "AI",
  "DOCTOR",
  "SYSTEM",
]);

export const InterviewQuestionType = z.enum([
  "single_choice",
  "multiple_choice",
  "free_text",
  "yes_no",
  "date_duration",
  "numeric",
  "boolean",
]);

export const QuestionAnswerSchema = z.object({
  questionId: z.string().min(1),
  value: z.string().optional(),
  state: ClinicalAnswerState,
  provenance: ClinicalProvenance,
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
}).strict();

export type ClinicalAnswerState = z.infer<typeof ClinicalAnswerState>;
export type ClinicalProvenance = z.infer<typeof ClinicalProvenance>;
export type InterviewQuestionType = z.infer<typeof InterviewQuestionType>;
export type QuestionAnswer = z.infer<typeof QuestionAnswerSchema>;

export type InterviewQuestion = {
  id: string;
  domain: string;
  label: string;
  description?: string;
  type: InterviewQuestionType;
  required: boolean;
  options?: Array<{ value: string; label: string; followUp?: string }>;
  followUpWhen?: string;
  branchOn?: "yes" | "no" | "known";
  nextWhenKnown?: string;
  nextWhenDenied?: string;
  nextWhenUnknown?: string;
  nextWhenDeclined?: string;
};

export type InterviewState = Record<string, QuestionAnswer>;

export const patientInterviewQuestions: InterviewQuestion[] = [
  {
    id: "presenting_complaint",
    domain: "presenting_complaint",
    label: "What is your main concern today?",
    type: "free_text",
    required: true,
  },
  {
    id: "hpi_onset",
    domain: "presenting_complaint",
    label: "When did it start?",
    type: "date_duration",
    required: false,
    nextWhenKnown: "hpi_duration",
  },
  {
    id: "hpi_duration",
    domain: "presenting_complaint",
    label: "How long has it been happening?",
    type: "date_duration",
    required: false,
    nextWhenKnown: "hpi_progression",
  },
  {
    id: "hpi_progression",
    domain: "presenting_complaint",
    label: "Is it getting worse, staying the same, or improving?",
    type: "single_choice",
    required: false,
    options: [
      { value: "worsening", label: "Worsening" },
      { value: "same", label: "Same" },
      { value: "improving", label: "Improving" },
    ],
    nextWhenKnown: "hpi_location",
  },
  {
    id: "hpi_location",
    domain: "presenting_complaint",
    label: "Where is it located?",
    type: "free_text",
    required: false,
    nextWhenKnown: "hpi_character",
  },
  {
    id: "hpi_character",
    domain: "presenting_complaint",
    label: "What does it feel like?",
    type: "free_text",
    required: false,
    nextWhenKnown: "hpi_aggravating",
  },
  {
    id: "hpi_aggravating",
    domain: "presenting_complaint",
    label: "What makes it worse?",
    type: "free_text",
    required: false,
    nextWhenKnown: "hpi_relieving",
  },
  {
    id: "hpi_relieving",
    domain: "presenting_complaint",
    label: "What helps or makes it better?",
    type: "free_text",
    required: false,
    nextWhenKnown: "associated_symptoms",
  },
  {
    id: "associated_symptoms",
    domain: "presenting_complaint",
    label: "Do you have any other symptoms with it?",
    type: "yes_no",
    required: false,
    branchOn: "yes",
    nextWhenKnown: "associated_symptoms_details",
    nextWhenDenied: "medical_conditions",
  },
  {
    id: "associated_symptoms_details",
    domain: "presenting_complaint",
    label: "Please tell us the other symptoms.",
    type: "free_text",
    required: false,
    nextWhenKnown: "medical_conditions",
  },
  {
    id: "medical_conditions",
    domain: "past_history",
    label: "Do you have any ongoing medical conditions?",
    type: "yes_no",
    required: false,
    branchOn: "yes",
    nextWhenKnown: "medical_conditions_details",
    nextWhenDenied: "previous_illness",
  },
  {
    id: "medical_conditions_details",
    domain: "past_history",
    label: "Which medical conditions do you have?",
    type: "free_text",
    required: false,
    nextWhenKnown: "previous_illness",
  },
  {
    id: "previous_illness",
    domain: "past_history",
    label: "Have you had any major illness in the past?",
    type: "yes_no",
    required: false,
    branchOn: "yes",
    nextWhenKnown: "previous_illness_details",
    nextWhenDenied: "hospitalization",
  },
  {
    id: "previous_illness_details",
    domain: "past_history",
    label: "Please tell us which major illness or serious condition.",
    type: "free_text",
    required: false,
    nextWhenKnown: "hospitalization",
  },
  {
    id: "hospitalization",
    domain: "past_history",
    label: "Have you been admitted to hospital before?",
    type: "yes_no",
    required: false,
    branchOn: "yes",
    nextWhenKnown: "hospitalization_details",
    nextWhenDenied: "surgery_history",
  },
  {
    id: "hospitalization_details",
    domain: "past_history",
    label: "When and why were you admitted?",
    type: "free_text",
    required: false,
    nextWhenKnown: "surgery_history",
  },
  {
    id: "surgery_history",
    domain: "surgery_history",
    label: "Have you had any surgery or procedure before?",
    type: "yes_no",
    required: false,
    branchOn: "yes",
    nextWhenKnown: "surgery_details",
    nextWhenDenied: "medication_current",
  },
  {
    id: "surgery_details",
    domain: "surgery_history",
    label: "What surgery or procedure was it, and when?",
    type: "free_text",
    required: false,
    nextWhenKnown: "medication_current",
  },
  {
    id: "medication_current",
    domain: "medication_history",
    label: "Are you currently taking any medicines?",
    type: "yes_no",
    required: false,
    branchOn: "yes",
    nextWhenKnown: "medication_details",
    nextWhenDenied: "allergy_medicine",
  },
  {
    id: "medication_details",
    domain: "medication_history",
    label: "Please list the medicines you take regularly.",
    type: "free_text",
    required: false,
    nextWhenKnown: "allergy_medicine",
  },
  {
    id: "allergy_medicine",
    domain: "allergy_history",
    label: "Do you have any medicine allergies?",
    type: "yes_no",
    required: false,
    branchOn: "yes",
    nextWhenKnown: "allergy_details",
    nextWhenDenied: "family_history",
  },
  {
    id: "allergy_details",
    domain: "allergy_history",
    label: "Which medicine or product caused the reaction, and what happened?",
    type: "free_text",
    required: false,
    nextWhenKnown: "family_history",
  },
  {
    id: "family_history",
    domain: "family_history",
    label: "Does anyone in your family have a serious illness we should know about?",
    type: "yes_no",
    required: false,
    branchOn: "yes",
    nextWhenKnown: "family_history_details",
    nextWhenDenied: "personal_history_smoking",
  },
  {
    id: "family_history_details",
    domain: "family_history",
    label: "Which family member and what illness?",
    type: "free_text",
    required: false,
    nextWhenKnown: "personal_history_smoking",
  },
  {
    id: "personal_history_smoking",
    domain: "personal_social_history",
    label: "Do you smoke or use tobacco products?",
    type: "yes_no",
    required: false,
    branchOn: "yes",
    nextWhenKnown: "personal_history_smoking_details",
    nextWhenDenied: "personal_history_alcohol",
  },
  {
    id: "personal_history_smoking_details",
    domain: "personal_social_history",
    label: "How much and how often do you use tobacco?",
    type: "free_text",
    required: false,
    nextWhenKnown: "personal_history_alcohol",
  },
  {
    id: "personal_history_alcohol",
    domain: "personal_social_history",
    label: "Do you drink alcohol?",
    type: "yes_no",
    required: false,
    branchOn: "yes",
    nextWhenKnown: "personal_history_alcohol_details",
    nextWhenDenied: "personal_history_sleep",
  },
  {
    id: "personal_history_alcohol_details",
    domain: "personal_social_history",
    label: "How often and how much do you drink?",
    type: "free_text",
    required: false,
    nextWhenKnown: "personal_history_sleep",
  },
  {
    id: "personal_history_sleep",
    domain: "personal_social_history",
    label: "How many hours of sleep do you usually get?",
    type: "numeric",
    required: false,
    nextWhenKnown: "personal_history_diet",
  },
  {
    id: "personal_history_diet",
    domain: "personal_social_history",
    label: "How is your usual diet?",
    type: "free_text",
    required: false,
    nextWhenKnown: "personal_history_activity",
  },
  {
    id: "personal_history_activity",
    domain: "personal_social_history",
    label: "Are you physically active on most days?",
    type: "yes_no",
    required: false,
    branchOn: "yes",
    nextWhenKnown: "ros_summary",
    nextWhenDenied: "ros_summary",
  },
  {
    id: "ros_summary",
    domain: "review_of_systems",
    label: "Do you have any other symptoms such as fever, weight change, or breathlessness?",
    type: "yes_no",
    required: false,
    branchOn: "yes",
    nextWhenKnown: "ros_details",
    nextWhenDenied: "interview_complete",
  },
  {
    id: "ros_details",
    domain: "review_of_systems",
    label: "Please tell us any other symptoms you have noticed.",
    type: "free_text",
    required: false,
    nextWhenKnown: "interview_complete",
  },
  {
    id: "interview_complete",
    domain: "system",
    label: "History complete",
    type: "boolean",
    required: true,
  },
];

export function normalizeAnswerState(value: string | undefined): ClinicalAnswerState {
  if (typeof value !== "string") return "NOT_ASKED";
  const trimmed = value.trim();
  if (!trimmed) return "NOT_ASKED";
  const normalized = trimmed.toLowerCase();
  if (["no", "none", "not", "nope"].includes(normalized)) return "DENIED";
  if (["i don't know", "idk", "unknown", "not sure", "unsure"].includes(normalized)) return "UNKNOWN";
  if (["prefer not to answer", "decline", "refuse", "rather not say"].includes(normalized)) return "DECLINED";
  return "KNOWN";
}

export function createClinicalFact(questionId: string, value?: string, provenance: ClinicalProvenance = "PATIENT"): QuestionAnswer {
  const state = normalizeAnswerState(value);
  return {
    questionId,
    value: value?.trim() || undefined,
    state,
    provenance,
  };
}

export function getQuestionState(questionId: string, state: InterviewState): ClinicalAnswerState {
  return state[questionId]?.state ?? "NOT_ASKED";
}

export function determineNextQuestion(currentState: InterviewState, questions: InterviewQuestion[] = patientInterviewQuestions): InterviewQuestion | undefined {
  let index = 0;

  while (index < questions.length) {
    const currentQuestion = questions[index];
    const currentAnswer = currentState[currentQuestion.id];

    if (!currentAnswer || currentAnswer.state === "NOT_ASKED") {
      return currentQuestion;
    }

    if (currentAnswer.state === "UNKNOWN" || currentAnswer.state === "DECLINED") {
      return currentQuestion;
    }

    let branchTarget: string | undefined;
    if (currentAnswer.state === "KNOWN") {
      branchTarget = currentQuestion.nextWhenKnown;
    } else if (currentAnswer.state === "DENIED") {
      branchTarget = currentQuestion.nextWhenDenied;
    }

    if (branchTarget) {
      const nextIndex = questions.findIndex((question) => question.id === branchTarget);
      if (nextIndex !== -1) {
        const nextQuestion = questions[nextIndex];
        const nextAnswer = currentState[nextQuestion.id];
        if (!nextAnswer || nextAnswer.state === "NOT_ASKED") {
          return nextQuestion;
        }
        index = nextIndex;
        continue;
      }
    }

    index += 1;
  }

  return undefined;
}

export function getQuestionsByDomain(domain: string, questions: InterviewQuestion[] = patientInterviewQuestions) {
  return questions.filter((question) => question.domain === domain);
}
