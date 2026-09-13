"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_FILE_SIZE } from "@/lib/documents";
import { usePatient } from "../PatientShell";
import ConfirmationCard from "@/components/ui/ConfirmationCard";

type Doc = {
  id: string;
  originalFilename: string;
  mimeType: string;
  ocrStatus: string;
  extractionStatus: string;
  verificationStatus: string;
  createdAt: string;
};

const documentExamples = [
  { icon: "📄", label: "Prescription", desc: "Doctor's notes & rx" },
  { icon: "🧪", label: "Lab report", desc: "Blood, urine, x-ray" },
  { icon: "🏥", label: "Discharge summary", desc: "Hospital records" },
  { icon: "💊", label: "Medicine list", desc: "Current medications" },
];

export default function Documents() {
  const router = useRouter();
  const { t, ensureSynced, connection, pendingCount, finishOfflineCase } = usePatient();
  const [docs, setDocs] = useState<Doc[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmedOcr, setConfirmedOcr] = useState<Record<string, boolean>>({});

  async function load() {
    try {
      const res = await fetch("/api/patient/documents", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        setDocs(d.documents ?? []);
        setError("");
        return;
      }
      if (connection !== "offline") {
        setError(t("networkError") || "Could not load documents. Please retry.");
      }
    } catch {
      setError(
        "You are offline. Existing document files are not cached on this device; reconnect to view or process them."
      );
    }
  }

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function onlineGate() {
    if (connection === "offline") {
      setError(
        "Reconnect first. Medical document files and OCR are intentionally never cached or processed offline."
      );
      return false;
    }
    const ok = await ensureSynced();
    if (!ok) {
      setError("Saved offline answers must finish syncing before document processing or submission.");
      return false;
    }
    return true;
  }

  async function upload() {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setError("Maximum file size is 20 MB.");
      return;
    }
    if (!(await onlineGate())) return;
    setBusy("upload");
    setError("");

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/patient/documents", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Upload failed");
      } else {
        setFile(null);
        await load();
      }
    } catch {
      setError(
        "Connection was lost during upload. The file was not cached locally; please select it again after reconnecting."
      );
    }
    setBusy("");
  }

  async function process(id: string, kind: "ocr" | "extraction") {
    if (!(await onlineGate())) return;
    setBusy(`${kind}:${id}`);
    setError("");

    try {
      const res = await fetch(`/api/patient/documents/${id}/${kind}`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error ?? `${kind} failed`);
      await load();
    } catch {
      setError("Connection was lost during processing. Reconnect and retry; processing endpoints are idempotent.");
    }
    setBusy("");
  }

  async function remove(id: string) {
    if (!(await onlineGate())) return;
    setBusy(`delete:${id}`);
    setError("");

    try {
      const res = await fetch(`/api/patient/documents/${id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error ?? "Could not remove document");
      await load();
    } catch {
      setError("Connection was lost before removal could be confirmed. Reconnect and refresh before retrying.");
    }
    setBusy("");
  }

  async function submit() {
    if (!(await onlineGate())) return;
    setBusy("submit");
    setError("");
    try {
      const res = await fetch("/api/patient/complete", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        await finishOfflineCase();
        router.push("/patient/complete");
        return;
      }
      if (res.status === 409) {
        setError("A document is still being processed or saved changes remain. Finish processing/sync before submission.");
      } else {
        setError(d.error ?? "Submission failed. Please retry.");
      }
    } catch {
      setError("Connection was lost before submission was confirmed. Your answers remain recoverable; reconnect and press Submit again. Submission is idempotent.");
    }
    setBusy("");
  }

  async function goToReview() {
    if (!(await onlineGate())) return;
    router.push("/patient/review");
  }


  return (
    <section className="flow-card reference-card documents-reference-card">
      <p className="eyebrow">{t("documentsEyebrow") || "8 · Medical Documents"}</p>
      <h1>
        Do you have any old medical reports?{" "}
        <span className="soft-title">{t("documentsOptional") || "(Optional)"}</span>
      </h1>
      <p className="lead">
        You can upload photos of prescriptions, lab reports or discharge papers so the healthcare team can review your history. If you don&apos;t have any, you can continue directly.
      </p>


      {/* Helpful Examples Grid */}
      <div className="document-examples-grid" role="group" aria-label="Examples of documents you can upload">
        {documentExamples.map((ex) => (
          <div key={ex.label} className="doc-example-item">
            <span className="doc-example-icon" aria-hidden="true">
              {ex.icon}
            </span>
            <div className="doc-example-text">
              <strong>{ex.label}</strong>
              <small>{ex.desc}</small>
            </div>
          </div>
        ))}
      </div>

      {pendingCount > 0 && (
        <div className="system-banner warning">
          <strong>
            {pendingCount} offline change{pendingCount === 1 ? "" : "s"}
          </strong>{" "}
          waiting to sync. Document processing and submission stay locked until sync finishes.
        </div>
      )}

      {/* Upload Dropzone */}
      <label
        className={`document-dropzone ${connection === "offline" ? "disabled" : ""}`}
        htmlFor="doc"
      >
        <span className="document-upload-icon">📷</span>
        <strong>Take a photo or choose a file</strong>
        <small>{t("dropzoneSub") || "Upload photos or PDF up to 20 MB"}</small>
        <input
          id="doc"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff"
          disabled={connection === "offline"}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {file && (
        <div className="selected-file-card">
          <span>📄</span>
          <div>
            <strong>{file.name}</strong>
            <small>
              {Math.max(0.01, file.size / 1024 / 1024).toFixed(2)} MB ·{" "}
              {t("readyToUpload") || "ready to upload"}
            </small>
          </div>
          <button
            type="button"
            className="secondary"
            disabled={!!busy || connection === "offline"}
            onClick={() => void upload()}
          >
            {busy === "upload" ? "Reading your medical report…" : (t("uploadBtn") || "Upload photo")}
          </button>
        </div>
      )}

      {/* Uploaded Documents List */}
      {docs.length > 0 && (
        <div className="document-card-list">
          {docs.map((d) => {
            const complete = d.ocrStatus === "COMPLETED" && d.extractionStatus === "COMPLETED";
            const isConfirmed = confirmedOcr[d.id];
            return (
              <div key={d.id} className="doc-item-wrapper">
                <article className="document-card">
                  <span className="document-type-icon">
                    {d.mimeType.includes("pdf") ? "PDF" : "IMG"}
                  </span>
                  <div className="document-card-copy">
                    <strong>{d.originalFilename}</strong>
                    <small>
                      {d.ocrStatus === "COMPLETED"
                        ? "Report successfully scanned"
                        : d.ocrStatus === "FAILED"
                        ? "We couldn't read this document clearly"
                        : "Reading medical report…"}
                    </small>
                    {!complete && (
                      <div className="document-progress">
                        <span
                          style={{
                            width:
                              d.ocrStatus === "COMPLETED"
                                ? d.extractionStatus === "COMPLETED"
                                  ? "100%"
                                  : "65%"
                                : "35%",
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="document-card-actions">
                    {d.ocrStatus !== "COMPLETED" ? (
                      <button
                        type="button"
                        className="secondary"
                        disabled={!!busy || connection === "offline"}
                        onClick={() => void process(d.id, "ocr")}
                      >
                        {busy === `ocr:${d.id}`
                          ? "Reading report…"
                          : d.ocrStatus === "FAILED"
                          ? "Try clearer photo"
                          : "Read report"}
                      </button>
                    ) : d.extractionStatus !== "COMPLETED" ? (
                      <button
                        type="button"
                        className="secondary"
                        disabled={!!busy || connection === "offline"}
                        onClick={() => void process(d.id, "extraction")}
                      >
                        {busy === `extraction:${d.id}`
                          ? "Checking medicines…"
                          : "Check medicines"}
                      </button>
                    ) : (
                      <span className="status ok">✓ Verified</span>
                    )}
                    <button
                      type="button"
                      className="icon-remove"
                      aria-label={`Remove ${d.originalFilename}`}
                      disabled={!!busy || connection === "offline"}
                      onClick={() => void remove(d.id)}
                    >
                      ×
                    </button>
                  </div>
                </article>

                {/* Clinical confirmation card for completed OCR */}
                {complete && !isConfirmed && (
                  <div style={{ marginTop: "8px" }}>
                    <ConfirmationCard
                      source="From uploaded prescription"
                      title="We found this information"
                      label="Report:"
                      value={d.originalFilename}
                      question="Is this the report you want to share with the doctor?"
                      confirmLabel="✓ YES, USE THIS REPORT"
                      editLabel="REPLACE PHOTO"
                      onConfirm={() =>
                        setConfirmedOcr((prev) => ({ ...prev, [d.id]: true }))
                      }
                      onEdit={() => void remove(d.id)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="document-privacy-note">
        🔒 {t("docPrivacyNote") || "Document files are never stored in the offline recovery cache. OCR/AI output remains unverified until a physician reviews it."}
      </div>

      {error && (
        <div className="system-banner error" role="alert">
          {error}
        </div>
      )}

      <div className="reference-actions stacked-mobile">
        <button type="button" className="secondary" onClick={() => router.back()}>
          ← {t("back")}
        </button>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="secondary"
            disabled={!!busy || connection === "offline"}
            onClick={() => void goToReview()}
          >
            Review all answers →
          </button>
          <button
            type="button"
            className="primary reference-primary"
            disabled={!!busy || connection === "offline"}
            onClick={() => void submit()}
          >
            {busy === "submit" ? t("processing") : t("submitToDoctor") || "Submit to doctor"} →
          </button>
        </div>
      </div>
    </section>
  );
}
