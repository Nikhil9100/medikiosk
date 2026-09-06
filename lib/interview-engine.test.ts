import { describe, expect, it } from "vitest";
import {
  ClinicalAnswerState,
  createClinicalFact,
  determineNextQuestion,
  getQuestionState,
  normalizeAnswerState,
  patientInterviewQuestions,
  type InterviewState,
} from "./interview-engine";

describe("clinical interview engine", () => {
  it("initializes questions as not asked", () => {
    expect(getQuestionState("hpi_onset", {})).toBe(ClinicalAnswerState.enum.NOT_ASKED);
  });

  it("answered questions become known facts", () => {
    const fact = createClinicalFact("hpi_onset", "3 days ago");
    expect(fact.state).toBe(ClinicalAnswerState.enum.KNOWN);
    expect(fact.value).toBe("3 days ago");
    expect(fact.provenance).toBe("PATIENT");
  });

  it("explicit no becomes denied", () => {
    expect(normalizeAnswerState("no")).toBe(ClinicalAnswerState.enum.DENIED);
  });

  it("do not know becomes unknown", () => {
    expect(normalizeAnswerState("i don't know")).toBe(ClinicalAnswerState.enum.UNKNOWN);
  });

  it("prefer not to answer becomes declined", () => {
    expect(normalizeAnswerState("prefer not to answer")).toBe(ClinicalAnswerState.enum.DECLINED);
  });

  it("blank or missing input does not become denied", () => {
    expect(normalizeAnswerState("")).toBe(ClinicalAnswerState.enum.NOT_ASKED);
    expect(normalizeAnswerState(undefined)).toBe(ClinicalAnswerState.enum.NOT_ASKED);
  });

  it("explicit yes triggers the surgery follow-up", () => {
    const state: InterviewState = {
      presenting_complaint: { questionId: "presenting_complaint", state: "KNOWN", value: "Headache", provenance: "PATIENT" },
      hpi_onset: { questionId: "hpi_onset", state: "KNOWN", value: "3 days ago", provenance: "PATIENT" },
      hpi_duration: { questionId: "hpi_duration", state: "KNOWN", value: "3 days", provenance: "PATIENT" },
      hpi_progression: { questionId: "hpi_progression", state: "KNOWN", value: "worsening", provenance: "PATIENT" },
      hpi_location: { questionId: "hpi_location", state: "KNOWN", value: "forehead", provenance: "PATIENT" },
      hpi_character: { questionId: "hpi_character", state: "KNOWN", value: "throbbing", provenance: "PATIENT" },
      hpi_aggravating: { questionId: "hpi_aggravating", state: "KNOWN", value: "light", provenance: "PATIENT" },
      hpi_relieving: { questionId: "hpi_relieving", state: "KNOWN", value: "dark room", provenance: "PATIENT" },
      associated_symptoms: { questionId: "associated_symptoms", state: "DENIED", value: "no", provenance: "PATIENT" },
      medical_conditions: { questionId: "medical_conditions", state: "DENIED", value: "no", provenance: "PATIENT" },
      previous_illness: { questionId: "previous_illness", state: "DENIED", value: "no", provenance: "PATIENT" },
      hospitalization: { questionId: "hospitalization", state: "DENIED", value: "no", provenance: "PATIENT" },
      surgery_history: { questionId: "surgery_history", state: "KNOWN", value: "yes", provenance: "PATIENT" },
    };
    const next = determineNextQuestion(state, patientInterviewQuestions);
    expect(next?.id).toBe("surgery_details");
  });

  it("explicit no does not trigger the surgery follow-up", () => {
    const state: InterviewState = {
      presenting_complaint: { questionId: "presenting_complaint", state: "KNOWN", value: "Headache", provenance: "PATIENT" },
      hpi_onset: { questionId: "hpi_onset", state: "KNOWN", value: "3 days ago", provenance: "PATIENT" },
      hpi_duration: { questionId: "hpi_duration", state: "KNOWN", value: "3 days", provenance: "PATIENT" },
      hpi_progression: { questionId: "hpi_progression", state: "KNOWN", value: "worsening", provenance: "PATIENT" },
      hpi_location: { questionId: "hpi_location", state: "KNOWN", value: "forehead", provenance: "PATIENT" },
      hpi_character: { questionId: "hpi_character", state: "KNOWN", value: "throbbing", provenance: "PATIENT" },
      hpi_aggravating: { questionId: "hpi_aggravating", state: "KNOWN", value: "light", provenance: "PATIENT" },
      hpi_relieving: { questionId: "hpi_relieving", state: "KNOWN", value: "dark room", provenance: "PATIENT" },
      associated_symptoms: { questionId: "associated_symptoms", state: "DENIED", value: "no", provenance: "PATIENT" },
      medical_conditions: { questionId: "medical_conditions", state: "DENIED", value: "no", provenance: "PATIENT" },
      previous_illness: { questionId: "previous_illness", state: "DENIED", value: "no", provenance: "PATIENT" },
      hospitalization: { questionId: "hospitalization", state: "DENIED", value: "no", provenance: "PATIENT" },
      surgery_history: { questionId: "surgery_history", state: "DENIED", value: "no", provenance: "PATIENT" },
    };
    const next = determineNextQuestion(state, patientInterviewQuestions);
    expect(next?.id).toBe("medication_current");
  });

  it("unknown or declined responses do not trigger branch assumptions", () => {
    const baseState: InterviewState = {
      presenting_complaint: { questionId: "presenting_complaint", state: "KNOWN", value: "Headache", provenance: "PATIENT" },
      hpi_onset: { questionId: "hpi_onset", state: "KNOWN", value: "3 days ago", provenance: "PATIENT" },
      hpi_duration: { questionId: "hpi_duration", state: "KNOWN", value: "3 days", provenance: "PATIENT" },
      hpi_progression: { questionId: "hpi_progression", state: "KNOWN", value: "worsening", provenance: "PATIENT" },
      hpi_location: { questionId: "hpi_location", state: "KNOWN", value: "forehead", provenance: "PATIENT" },
      hpi_character: { questionId: "hpi_character", state: "KNOWN", value: "throbbing", provenance: "PATIENT" },
      hpi_aggravating: { questionId: "hpi_aggravating", state: "KNOWN", value: "light", provenance: "PATIENT" },
      hpi_relieving: { questionId: "hpi_relieving", state: "KNOWN", value: "dark room", provenance: "PATIENT" },
      associated_symptoms: { questionId: "associated_symptoms", state: "DENIED", value: "no", provenance: "PATIENT" },
      medical_conditions: { questionId: "medical_conditions", state: "DENIED", value: "no", provenance: "PATIENT" },
      previous_illness: { questionId: "previous_illness", state: "DENIED", value: "no", provenance: "PATIENT" },
      hospitalization: { questionId: "hospitalization", state: "DENIED", value: "no", provenance: "PATIENT" },
    };
    const unknownNext = determineNextQuestion({ ...baseState, surgery_history: { questionId: "surgery_history", state: "UNKNOWN", value: "i don't know", provenance: "PATIENT" } }, patientInterviewQuestions);
    const declinedNext = determineNextQuestion({ ...baseState, surgery_history: { questionId: "surgery_history", state: "DECLINED", value: "prefer not to answer", provenance: "PATIENT" } }, patientInterviewQuestions);

    expect(unknownNext?.id).toBe("surgery_history");
    expect(declinedNext?.id).toBe("surgery_history");
  });

  it("medicine follow-up appears only when the patient is actively taking medicines", () => {
    const state: InterviewState = {
      presenting_complaint: { questionId: "presenting_complaint", state: "KNOWN", value: "Headache", provenance: "PATIENT" },
      hpi_onset: { questionId: "hpi_onset", state: "KNOWN", value: "3 days ago", provenance: "PATIENT" },
      hpi_duration: { questionId: "hpi_duration", state: "KNOWN", value: "3 days", provenance: "PATIENT" },
      hpi_progression: { questionId: "hpi_progression", state: "KNOWN", value: "worsening", provenance: "PATIENT" },
      hpi_location: { questionId: "hpi_location", state: "KNOWN", value: "forehead", provenance: "PATIENT" },
      hpi_character: { questionId: "hpi_character", state: "KNOWN", value: "throbbing", provenance: "PATIENT" },
      hpi_aggravating: { questionId: "hpi_aggravating", state: "KNOWN", value: "light", provenance: "PATIENT" },
      hpi_relieving: { questionId: "hpi_relieving", state: "KNOWN", value: "dark room", provenance: "PATIENT" },
      associated_symptoms: { questionId: "associated_symptoms", state: "DENIED", value: "no", provenance: "PATIENT" },
      medical_conditions: { questionId: "medical_conditions", state: "DENIED", value: "no", provenance: "PATIENT" },
      previous_illness: { questionId: "previous_illness", state: "DENIED", value: "no", provenance: "PATIENT" },
      hospitalization: { questionId: "hospitalization", state: "DENIED", value: "no", provenance: "PATIENT" },
      surgery_history: { questionId: "surgery_history", state: "DENIED", value: "no", provenance: "PATIENT" },
      medication_current: { questionId: "medication_current", state: "KNOWN", value: "yes", provenance: "PATIENT" },
    };
    const yesNext = determineNextQuestion(state, patientInterviewQuestions);
    expect(yesNext?.id).toBe("medication_details");

    const noNext = determineNextQuestion({ ...state, medication_current: { questionId: "medication_current", state: "DENIED", value: "no", provenance: "PATIENT" } }, patientInterviewQuestions);
    expect(noNext?.id).toBe("allergy_medicine");
  });

  it("allergy follow-up is conditional on a positive response", () => {
    const state: InterviewState = {
      presenting_complaint: { questionId: "presenting_complaint", state: "KNOWN", value: "Headache", provenance: "PATIENT" },
      hpi_onset: { questionId: "hpi_onset", state: "KNOWN", value: "3 days ago", provenance: "PATIENT" },
      hpi_duration: { questionId: "hpi_duration", state: "KNOWN", value: "3 days", provenance: "PATIENT" },
      hpi_progression: { questionId: "hpi_progression", state: "KNOWN", value: "worsening", provenance: "PATIENT" },
      hpi_location: { questionId: "hpi_location", state: "KNOWN", value: "forehead", provenance: "PATIENT" },
      hpi_character: { questionId: "hpi_character", state: "KNOWN", value: "throbbing", provenance: "PATIENT" },
      hpi_aggravating: { questionId: "hpi_aggravating", state: "KNOWN", value: "light", provenance: "PATIENT" },
      hpi_relieving: { questionId: "hpi_relieving", state: "KNOWN", value: "dark room", provenance: "PATIENT" },
      associated_symptoms: { questionId: "associated_symptoms", state: "DENIED", value: "no", provenance: "PATIENT" },
      medical_conditions: { questionId: "medical_conditions", state: "DENIED", value: "no", provenance: "PATIENT" },
      previous_illness: { questionId: "previous_illness", state: "DENIED", value: "no", provenance: "PATIENT" },
      hospitalization: { questionId: "hospitalization", state: "DENIED", value: "no", provenance: "PATIENT" },
      surgery_history: { questionId: "surgery_history", state: "DENIED", value: "no", provenance: "PATIENT" },
      medication_current: { questionId: "medication_current", state: "DENIED", value: "no", provenance: "PATIENT" },
      allergy_medicine: { questionId: "allergy_medicine", state: "KNOWN", value: "yes", provenance: "PATIENT" },
    };
    const next = determineNextQuestion(state, patientInterviewQuestions);
    expect(next?.id).toBe("allergy_details");
  });
});
