"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePatientWorkflow } from "../PatientShell";
import {
  determineNextQuestion,
  patientInterviewQuestions,
  type QuestionAnswer,
} from "@/lib/interview-engine";

type AnswerDraft = {
  value: string;
  state: "NOT_ASKED" | "KNOWN" | "UNKNOWN" | "DECLINED" | "DENIED";
};

export default function PatientInterviewPage() {
  const router = useRouter();
  const { workflow, setInterviewFact, syncSession, t } = usePatientWorkflow();
  const [draft, setDraft] = useState<AnswerDraft>({ value: "", state: "NOT_ASKED" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentQuestion = useMemo(() => {
    return determineNextQuestion(workflow.interviewFacts, patientInterviewQuestions);
  }, [workflow.interviewFacts]);

  const currentFact: QuestionAnswer | undefined = currentQuestion ? workflow.interviewFacts[currentQuestion.id] : undefined;

  function updateDraft(nextValue: string, nextState: AnswerDraft["state"]) {
    setDraft({ value: nextValue, state: nextState });
  }

  async function submitAnswer(questionId: string, value: string | undefined, state: AnswerDraft["state"]) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setInterviewFact(questionId, value, "PATIENT");
    void syncSession({ interviewData: { [questionId]: { questionId, value, state, provenance: "PATIENT" } }, workflowStep: "interview" });
    setDraft({ value: "", state: "NOT_ASKED" });
    setIsSubmitting(false);
  }

  function handleComplete() {
    void syncSession({ workflowStep: "interview" });
    router.push("/patient");
  }

  if (!currentQuestion) {
    return (
      <section className="flow-screen" aria-labelledby="interview-title">
        <p className="eyebrow">{t("interviewStep")}</p>
        <h1 id="interview-title">{t("interviewCompleteTitle")}</h1>
        <p className="lead-copy">{t("interviewCompleteHelper")}</p>
        <div className="primary-action-stack">
          <button type="button" className="primary-button" onClick={handleComplete}>
            {t("interviewCompleteNext")} <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    );
  }

  const isAnswered = currentFact !== undefined && currentFact.state !== "NOT_ASKED";
  const isFreeText = currentQuestion.type === "free_text";
  const isYesNo = currentQuestion.type === "yes_no";
  const isSingleChoice = currentQuestion.type === "single_choice";
  const isNumeric = currentQuestion.type === "numeric";
  const isDateDuration = currentQuestion.type === "date_duration";

  return (
    <section className="flow-screen interview-screen" aria-labelledby="interview-title">
      <p className="eyebrow">{t("interviewStep")}</p>
      <h1 id="interview-title">{t("interviewTitle")}</h1>
      <p className="lead-copy interview-subtitle">{t("interviewHelper")}</p>

      <div className="interview-card" aria-live="polite">
        <div className="interview-card__question">
          <span className="interview-card__domain">{currentQuestion.domain.replace(/_/g, " ")}</span>
          <h2>{currentQuestion.label}</h2>
          {currentQuestion.description && <p className="interview-card__description">{currentQuestion.description}</p>}
        </div>

        <div className="interview-card__controls">
          {isFreeText && (
            <div>
              <label htmlFor={`question-${currentQuestion.id}`} className="sr-only">
                {currentQuestion.label}
              </label>
              <textarea
                id={`question-${currentQuestion.id}`}
                aria-label={currentQuestion.label}
                value={draft.value}
                onChange={(event) => updateDraft(event.target.value, "KNOWN")}
                placeholder={t("interviewAnswerPlaceholder")}
                rows={4}
                className="interview-input"
                disabled={isSubmitting || isAnswered}
              />
            </div>
          )}

          {isYesNo && (
            <div className="interview-choices" role="group" aria-label={currentQuestion.label}>
              <button
                type="button"
                className={`interview-choice ${draft.state === "KNOWN" && draft.value.toLowerCase() === "yes" ? "interview-choice--selected" : ""}`}
                onClick={() => updateDraft("yes", "KNOWN")}
                disabled={isSubmitting || isAnswered}
              >
                {t("interviewYes")}
              </button>
              <button
                type="button"
                className={`interview-choice ${draft.state === "DENIED" && draft.value.toLowerCase() === "no" ? "interview-choice--selected" : ""}`}
                onClick={() => updateDraft("no", "DENIED")}
                disabled={isSubmitting || isAnswered}
              >
                {t("interviewNo")}
              </button>
              <button
                type="button"
                className="interview-choice interview-choice--secondary"
                onClick={() => submitAnswer(currentQuestion.id, undefined, "UNKNOWN")}
                disabled={isSubmitting || isAnswered}
              >
                {t("interviewUnknown")}
              </button>
              <button
                type="button"
                className="interview-choice interview-choice--secondary"
                onClick={() => submitAnswer(currentQuestion.id, undefined, "DECLINED")}
                disabled={isSubmitting || isAnswered}
              >
                {t("interviewDeclined")}
              </button>
            </div>
          )}

          {isSingleChoice && currentQuestion.options && (
            <div className="interview-choices" role="group" aria-label={currentQuestion.label}>
              {currentQuestion.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`interview-choice ${draft.value === option.value ? "interview-choice--selected" : ""}`}
                  onClick={() => updateDraft(option.value, "KNOWN")}
                  disabled={isSubmitting || isAnswered}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {isNumeric && (
            <div className="interview-field">
              <label htmlFor={`question-${currentQuestion.id}`} className="sr-only">
                {currentQuestion.label}
              </label>
              <input
                id={`question-${currentQuestion.id}`}
                type="number"
                aria-label={currentQuestion.label}
                value={draft.value}
                onChange={(event) => updateDraft(event.target.value, "KNOWN")}
                placeholder={t("interviewAnswerPlaceholder")}
                className="interview-input"
                disabled={isSubmitting || isAnswered}
              />
            </div>
          )}

          {isDateDuration && (
            <div className="interview-field">
              <label htmlFor={`question-${currentQuestion.id}`} className="sr-only">
                {currentQuestion.label}
              </label>
              <input
                id={`question-${currentQuestion.id}`}
                type="text"
                aria-label={currentQuestion.label}
                value={draft.value}
                onChange={(event) => updateDraft(event.target.value, "KNOWN")}
                placeholder={t("interviewAnswerPlaceholder")}
                className="interview-input"
                disabled={isSubmitting || isAnswered}
              />
            </div>
          )}

          {isAnswered && (
            <p className="inline-status" role="status">
              {t("interviewRecorded")}
            </p>
          )}
        </div>

        <div className="primary-action-stack">
          {isFreeText || isNumeric || isDateDuration || isSingleChoice ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => submitAnswer(currentQuestion.id, draft.value || undefined, draft.state === "NOT_ASKED" ? "KNOWN" : draft.state)}
              disabled={isSubmitting || isAnswered || !draft.value.trim()}
            >
              {t("interviewNext")} <span aria-hidden="true">→</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="patient-footer">
        <button type="button" className="back-button" onClick={() => router.push("/patient/anatomy")}>
          <span aria-hidden="true">←</span> {t("consentBack")}
        </button>
      </div>
    </section>
  );
}
