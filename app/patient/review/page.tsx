"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePatient } from "../PatientShell";

type ComplaintItem = {
  id: string;
  position: number;
  complaintText: string;
  severity: string | null;
};

type DocItem = {
  id: string;
  originalFilename: string;
  ocrStatus: string;
  extractionStatus: string;
};

const severityDisplayNames: Record<string, { label: string; icon: string }> = {
  MILD: { label: "Mild discomfort", icon: "😌" },
  MODERATE: { label: "Moderate pain", icon: "😐" },
  SEVERE: { label: "Severe pain", icon: "😣" },
  VERY_SEVERE: { label: "Very severe pain", icon: "🚨" },
};

const regionDisplayNames: Record<string, string> = {
  head: "Head & Neck",
  chest: "Chest",
  abdomen: "Stomach / Abdomen",
  back: "Back",
  arm: "Arms & Hands",
  leg: "Legs & Feet",
  skin: "Skin",
  other: "Other area",
};

export default function ReviewPage() {
  const router = useRouter();
  const { workflow, t, ensureSynced, finishOfflineCase, connection } = usePatient();
  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Load recorded complaints and symptoms
    async function fetchSummary() {
      try {
        const [cRes, dRes] = await Promise.all([
          fetch("/api/patient/complaints", { cache: "no-store" }),
          fetch("/api/patient/documents", { cache: "no-store" }),
        ]);
        if (cRes.ok) {
          const cData = await cRes.json();
          setComplaints(cData.complaints ?? []);
        }
        if (dRes.ok) {
          const dData = await dRes.json();
          setDocuments(dData.documents ?? []);
        }
      } catch {
        // Fallback to workflow state
      }
    }
    void fetchSummary();
  }, []);

  const primaryComplaint =
    complaints.find((c) => c.position === 1)?.complaintText ||
    workflow.complaint ||
    "Not specified";

  const otherSymptoms = complaints
    .filter((c) => c.position > 1)
    .map((c) => c.complaintText);

  const regionName = workflow.region
    ? regionDisplayNames[workflow.region] || workflow.region
    : "Not specified";

  const severityInfo = workflow.severity
    ? severityDisplayNames[workflow.severity] || { label: workflow.severity, icon: "🩺" }
    : { label: "Not rated", icon: "○" };

  async function handleSubmitToDoctor() {
    if (submitting) return;
    setError("");

    if (connection === "offline") {
      setError(
        "You are offline. Reconnect before submitting so the clinical team receives your complete answers safely."
      );
      return;
    }

    const ok = await ensureSynced();
    if (!ok) {
      setError("Please wait for all your saved answers to finish syncing before final submission.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/patient/complete", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await finishOfflineCase();
        router.push("/patient/complete");
        return;
      }
      if (res.status === 409) {
        setError(
          "A document is still being read or some answers are syncing. Please wait a moment and try again."
        );
      } else {
        setError(
          data.error ?? (t("saveFailedRetry") || "We couldn't submit your visit yet. Please try again.")
        );
      }
    } catch {
      setError(
        "Connection was interrupted during submission. Your answers are safe on this device. Reconnect and tap Submit again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flow-card reference-card review-reference-card">
      <div className="review-header-badge">
        <span className="review-badge-icon" aria-hidden="true">
          📋
        </span>
        <p className="eyebrow">Ready for the Doctor</p>
      </div>

      <h1 className="review-main-title">Review your information</h1>
      <p className="lead review-lead">
        Check your details before they are sent to the healthcare team. Everything is written in plain language.
      </p>

      <div className="review-cards-list" role="list">
        {/* 1. Main Concern */}
        <div className="review-item-card" role="listitem">
          <div className="review-item-content">
            <span className="review-item-kicker">What brings you here?</span>
            <strong className="review-item-value">{primaryComplaint}</strong>
          </div>
          <button
            type="button"
            className="review-edit-btn"
            onClick={() => router.push("/patient/complaint")}
            aria-label="Edit what brings you to the hospital"
          >
            ✎ EDIT
          </button>
        </div>

        {/* 2. Where is the Problem */}
        <div className="review-item-card" role="listitem">
          <div className="review-item-content">
            <span className="review-item-kicker">Where is the problem?</span>
            <strong className="review-item-value">📍 {regionName}</strong>
          </div>
          <button
            type="button"
            className="review-edit-btn"
            onClick={() => router.push("/patient/anatomy")}
            aria-label="Edit where the problem is located"
          >
            ✎ EDIT
          </button>
        </div>

        {/* 3. How Bad Is It */}
        <div className="review-item-card" role="listitem">
          <div className="review-item-content">
            <span className="review-item-kicker">How bad is it?</span>
            <strong className="review-item-value">
              <span className="review-severity-icon" aria-hidden="true">
                {severityInfo.icon}
              </span>{" "}
              {severityInfo.label}
            </strong>
          </div>
          <button
            type="button"
            className="review-edit-btn"
            onClick={() => router.push("/patient/anatomy")}
            aria-label="Edit severity of discomfort"
          >
            ✎ EDIT
          </button>
        </div>

        {/* 4. What else are you experiencing */}
        <div className="review-item-card" role="listitem">
          <div className="review-item-content">
            <span className="review-item-kicker">What else are you experiencing?</span>
            <strong className="review-item-value">
              {otherSymptoms.length > 0 ? otherSymptoms.join(", ") : "None reported"}
            </strong>
          </div>
          <button
            type="button"
            className="review-edit-btn"
            onClick={() => router.push("/patient/symptoms")}
            aria-label="Edit other symptoms"
          >
            ✎ EDIT
          </button>
        </div>

        {/* 5. Medical Reports */}
        <div className="review-item-card" role="listitem">
          <div className="review-item-content">
            <span className="review-item-kicker">Medical reports</span>
            <strong className="review-item-value">
              📄 {documents.length > 0 ? `${documents.length} report${documents.length === 1 ? "" : "s"} uploaded` : "None uploaded (Optional)"}
            </strong>
          </div>
          <button
            type="button"
            className="review-edit-btn"
            onClick={() => router.push("/patient/documents")}
            aria-label="Edit uploaded documents"
          >
            ✎ EDIT
          </button>
        </div>
      </div>

      <div className="review-trust-note">
        🔒 <span>Your health details will be securely transferred directly to the attending physician&apos;s consultation screen.</span>
      </div>


      {error && (
        <div className="system-banner error" role="alert">
          {error}
        </div>
      )}

      <div className="reference-actions review-actions-bar">
        <button
          type="button"
          className="secondary review-secondary-cta"
          onClick={() => router.push("/patient/complaint")}
        >
          EDIT INFORMATION
        </button>

        <button
          type="button"
          className="primary reference-primary review-submit-primary"
          disabled={submitting}
          onClick={() => void handleSubmitToDoctor()}
          aria-label="Everything looks correct, submit to doctor"
        >
          {submitting ? "Sending to doctor…" : "EVERYTHING LOOKS CORRECT → SUBMIT TO DOCTOR"}
        </button>
      </div>
    </section>
  );
}
