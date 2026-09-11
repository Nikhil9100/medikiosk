"use client";

import { useRef, useState } from "react";
import { usePatientWorkflow } from "../PatientShell";
import {
  isSupportedMimeType,
  validateFileSize,
} from "@/lib/documents";
import {
  EVIDENCE_CATEGORY_ORDER,
  evidenceCategoryKey,
  evidenceMethodKey,
  formatEvidenceValue,
} from "@/lib/extraction/ui";

type EvidenceCategory = "DIAGNOSIS" | "MEDICATION" | "INVESTIGATION" | "PROCEDURE" | "ALLERGY" | "MEDICAL_HISTORY" | "CHRONOLOGY";

interface EvidenceItem {
  id: string;
  documentId: string;
  sessionId: string;
  category: EvidenceCategory;
  normalizedValue: {
    name?: string;
    value?: string;
    unit?: string;
    dose?: string;
    frequency?: string;
    date?: string;
    details?: string;
  };
  originalOcrWording: string;
  pageNumber: number;
  extractionMethod: "DETERMINISTIC" | "AI";
  confidence?: number;
  verificationState: "UNVERIFIED" | "ACCEPTED" | "REJECTED";
  uncertaintyNotes?: string;
  contradictionGroupId?: string;
}

interface ExtractionRun {
  extractionStatus: "NOT_STARTED" | "PROCESSING" | "COMPLETED" | "FAILED" | "NOT_CONFIGURED" | "UNAVAILABLE" | "MALFORMED_RESPONSE";
  aiProviderState: "NOT_CONFIGURED" | "UNAVAILABLE" | "SUCCESS" | "MALFORMED_RESPONSE" | "FAILED";
  itemCount: number;
  items: EvidenceItem[];
}

const SUPPORTED_DISPLAY_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
  "image/bmp": "BMP",
  "image/tiff": "TIFF",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PatientDocumentsPage() {
  const { workflow, setDocuments, resetPatientFlow, t } = usePatientWorkflow();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [completion, setCompletion] = useState<{ caseId: string | null; caseStatus: string } | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completionError, setCompletionError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>("");
  const [extractionRuns, setExtractionRuns] = useState<Record<string, ExtractionRun>>({});
  const [extractionBusy, setExtractionBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadExtractionRun(documentId: string) {
    const response = await fetch(`/api/patient/documents/${documentId}/extraction`);
    if (!response.ok) return;
    const data = (await response.json()) as ExtractionRun;
    setExtractionRuns((prev) => ({ ...prev, [documentId]: data }));
  }

  async function handleStartExtraction(documentId: string) {
    if (extractionBusy) return;
    setExtractionBusy(true);
    try {
      const response = await fetch(`/api/patient/documents/${documentId}/extraction`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Extraction failed");
      }
      const data = (await response.json()) as ExtractionRun;
      setExtractionRuns((prev) => ({ ...prev, [documentId]: data }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Extraction failed");
    } finally {
      setExtractionBusy(false);
    }
  }

  async function handleRetryExtraction(documentId: string) {
    if (extractionBusy) return;
    setExtractionBusy(true);
    try {
      const response = await fetch(`/api/patient/documents/${documentId}/extraction/retry`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Extraction retry failed");
      }
      const data = (await response.json()) as ExtractionRun;
      setExtractionRuns((prev) => ({ ...prev, [documentId]: data }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Extraction retry failed");
    } finally {
      setExtractionBusy(false);
    }
  }

  async function handleReviewItem(
    documentId: string,
    itemId: string,
    verificationState: "UNVERIFIED" | "ACCEPTED" | "REJECTED",
  ) {
    try {
      const response = await fetch(`/api/patient/documents/${documentId}/extraction`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, verificationState }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Review failed");
      }
      const data = (await response.json()) as { item: EvidenceItem };
      setExtractionRuns((prev) => {
        const run = prev[documentId];
        if (!run) return prev;
        const items = run.items.map((item) =>
          item.id === itemId ? data.item : item,
        );
        return { ...prev, [documentId]: { ...run, items } };
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Review failed");
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError("");

    if (!isSupportedMimeType(file.type)) {
      setUploadError(t("documentUnsupportedType"));
      setSelectedFile(null);
      return;
    }

    if (!validateFileSize(file.size)) {
      setUploadError(t("documentFileTooLarge"));
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  }

  function removeSelectedFile() {
    setSelectedFile(null);
    setUploadError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleUpload() {
    if (!selectedFile || isUploading) return;

    setIsUploading(true);
    setUploadError("");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/patient/documents", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const document = (await response.json()) as {
        id: string;
        sessionId: string;
        documentType: "PRESCRIPTION" | "LAB_REPORT" | "IMAGING" | "DISCHARGE_SUMMARY" | "VACCINATION" | "INSURANCE" | "OTHER";
        status: "RECEIVED" | "VALIDATING" | "READY_FOR_OCR" | "OCR_PROCESSING" | "OCR_COMPLETE" | "EXTRACTION_PROCESSING" | "EXTRACTION_COMPLETE" | "NEEDS_REVIEW" | "VERIFIED" | "FAILED";
        originalFilename: string;
        mimeType: string;
        pageCount?: number;
        createdAt: string;
        receivedAt: string;
        updatedAt: string;
        processingStatus: "RECEIVED" | "VALIDATING" | "READY_FOR_OCR" | "OCR_PROCESSING" | "OCR_COMPLETE" | "EXTRACTION_PROCESSING" | "EXTRACTION_COMPLETE" | "NEEDS_REVIEW" | "VERIFIED" | "FAILED";
        provenance: "PATIENT" | "SYSTEM" | "DOCTOR";
        ocrStatus: "NOT_STARTED" | "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "NOT_CONFIGURED" | "UNAVAILABLE";
        verificationStatus: "UNVERIFIED" | "PENDING_REVIEW" | "VERIFIED" | "REJECTED";
        errors: string[];
        extractedFacts: Array<{
          questionId: string;
          value?: string;
          state: "NOT_ASKED" | "KNOWN" | "UNKNOWN" | "DECLINED" | "DENIED";
          provenance: "PATIENT" | "VOICE" | "TOUCH" | "OCR" | "AI" | "DOCTOR" | "SYSTEM";
          sourceReference?: { page?: number; section?: string };
          confidence?: number;
        }>;
        sourceReference?: { page?: number; section?: string };
        ocrResults: Array<{
          documentId: string;
          sessionId: string;
          pages: Array<{
            pageNumber: number;
            extractedText: string;
            confidence?: number;
            boundingBoxes?: Array<{
              x: number;
              y: number;
              width: number;
              height: number;
              text: string;
              confidence?: number;
            }>;
            language?: string;
          }>;
          providerMetadata: {
            provider: string;
            model?: string;
            language: string;
            createdAt: string;
          };
          handwritingDetected: boolean;
          processingDurationMs?: number;
          createdAt: string;
        }>;
      };
      const updatedDocuments = [...workflow.documents, document];
      setDocuments(updatedDocuments);
      removeSelectedFile();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  function handleRemoveDocument(documentId: string) {
    const updatedDocuments = workflow.documents.filter((doc) => doc.id !== documentId);
    setDocuments(updatedDocuments);
  }

  async function handleStartOcr(documentId: string) {
    if (isUploading) return;

    setIsUploading(true);
    setUploadError("");

    try {
      const response = await fetch(`/api/patient/documents/${documentId}/ocr`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "OCR failed");
      }

      const data = await response.json();

      const updatedDocuments = workflow.documents.map((doc) =>
        doc.id === documentId
          ? { ...doc, processingStatus: (data.status as "RECEIVED" | "VALIDATING" | "READY_FOR_OCR" | "OCR_PROCESSING" | "OCR_COMPLETE" | "EXTRACTION_PROCESSING" | "EXTRACTION_COMPLETE" | "NEEDS_REVIEW" | "VERIFIED" | "FAILED") ?? doc.processingStatus, ocrStatus: (data.ocrStatus as "NOT_STARTED" | "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "NOT_CONFIGURED" | "UNAVAILABLE") ?? doc.ocrStatus }
          : doc,
      );
      setDocuments(updatedDocuments);

      // Refresh extraction availability when OCR completes.
      if ((data.status as string) === "OCR_COMPLETE") {
        await loadExtractionRun(documentId);
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "OCR failed");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRetryOcr(documentId: string) {
    if (isUploading) return;

    setIsUploading(true);
    setUploadError("");

    try {
      const response = await fetch(`/api/patient/documents/${documentId}/ocr/retry`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "OCR retry failed");
      }

      const data = await response.json();
      
      const updatedDocuments = workflow.documents.map((doc) =>
        doc.id === documentId
          ? { ...doc, processingStatus: (data.status as "RECEIVED" | "VALIDATING" | "READY_FOR_OCR" | "OCR_PROCESSING" | "OCR_COMPLETE" | "EXTRACTION_PROCESSING" | "EXTRACTION_COMPLETE" | "NEEDS_REVIEW" | "VERIFIED" | "FAILED") ?? doc.processingStatus, ocrStatus: (data.ocrStatus as "NOT_STARTED" | "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "NOT_CONFIGURED" | "UNAVAILABLE") ?? doc.ocrStatus }
          : doc,
      );
      setDocuments(updatedDocuments);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "OCR retry failed");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRefreshOcrStatus(documentId: string) {
    try {
      const response = await fetch(`/api/patient/documents/${documentId}/ocr`);
      if (!response.ok) return;

      const data = await response.json();
      
      const updatedDocuments = workflow.documents.map((doc) =>
        doc.id === documentId
          ? {
              ...doc,
              processingStatus: (data.processingStatus as "RECEIVED" | "VALIDATING" | "READY_FOR_OCR" | "OCR_PROCESSING" | "OCR_COMPLETE" | "EXTRACTION_PROCESSING" | "EXTRACTION_COMPLETE" | "NEEDS_REVIEW" | "VERIFIED" | "FAILED") ?? doc.processingStatus,
              ocrStatus: (data.ocrStatus as "NOT_STARTED" | "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "NOT_CONFIGURED" | "UNAVAILABLE") ?? doc.ocrStatus,
              ocrResults: (data.ocrResults as Array<{ documentId: string; sessionId: string; pages: Array<{ pageNumber: number; extractedText: string; confidence?: number; boundingBoxes?: Array<{ x: number; y: number; width: number; height: number; text: string; confidence?: number }>; language?: string }>; providerMetadata: { provider: string; model?: string; language: string; createdAt: string }; handwritingDetected: boolean; processingDurationMs?: number; createdAt: string }>) ?? doc.ocrResults,
            }
          : doc,
      );
      setDocuments(updatedDocuments);
    } catch {
      // Silently fail status refresh
    }
  }

  function renderExtractionSection(document: { id: string; processingStatus: string; extractionStatus?: string }) {
    const run = extractionRuns[document.id];

    // Extraction is only offered once OCR is complete.
    if (document.processingStatus !== "OCR_COMPLETE" && document.processingStatus !== "EXTRACTION_PROCESSING" && document.processingStatus !== "EXTRACTION_COMPLETE") {
      if (!run) return null;
    }

    const showStartButton =
      document.processingStatus === "OCR_COMPLETE" &&
      (!run || run.extractionStatus === "NOT_STARTED");

    const showRetryButton =
      run?.extractionStatus === "FAILED" ||
      run?.extractionStatus === "MALFORMED_RESPONSE" ||
      run?.extractionStatus === "UNAVAILABLE" ||
      (document.processingStatus === "FAILED" && !run);

    if (showStartButton) {
      return (
        <div className="document-item__actions">
          <button
            type="button"
            className="primary-button primary-button--compact"
            onClick={() => handleStartExtraction(document.id)}
            disabled={extractionBusy}
          >
            {extractionBusy ? t("documentExtracting") : t("documentStartExtraction")}
          </button>
          <p className="document-item__meta">{t("documentExtractionHelper")}</p>
        </div>
      );
    }

    if (showRetryButton) {
      return (
        <div className="document-item__actions">
          <button
            type="button"
            className="primary-button primary-button--compact"
            onClick={() => handleRetryExtraction(document.id)}
            disabled={extractionBusy}
          >
            {t("documentRetryExtraction")}
          </button>
        </div>
      );
    }

    if (!run || run.extractionStatus === "NOT_STARTED") return null;

    if (run.extractionStatus === "PROCESSING") {
      return (
        <div className="document-item__extraction-results" aria-live="polite">
          <p className="extraction-results__helper">{t("documentExtracting")}</p>
        </div>
      );
    }

    if (run.extractionStatus === "FAILED") {
      return (
        <div className="document-item__extraction-results" role="alert">
          <p className="extraction-results__helper">{t("documentExtractionFailed")}</p>
          <div className="document-item__actions">
            <button
              type="button"
              className="primary-button primary-button--compact"
              onClick={() => handleRetryExtraction(document.id)}
              disabled={extractionBusy}
            >
              {t("documentRetryExtraction")}
            </button>
          </div>
        </div>
      );
    }

    if (run.extractionStatus === "COMPLETED") {
      return (
        <div className="document-item__extraction-results">
          <h3 className="extraction-results__title">{t("documentExtractionListTitle")}</h3>
          <p className="extraction-results__helper">{t("documentExtractionHelper")}</p>
          {run.aiProviderState !== "NOT_CONFIGURED" && run.aiProviderState !== "SUCCESS" && (
            <p className="document-item__meta">{t("extractionAiUnavailable")}</p>
          )}
          {run.items.length === 0 ? (
            <p className="evidence-empty">{t("documentNoEvidence")}</p>
          ) : (
            EVIDENCE_CATEGORY_ORDER.map((category) => {
              const categoryItems = run.items.filter((item) => item.category === category);
              if (categoryItems.length === 0) return null;
              return (
                <div key={category} className="evidence-category">
                  <h4 className="evidence-category__heading">{t(evidenceCategoryKey(category) as never)}</h4>
                  <ul className="evidence-category__list">
                    {categoryItems.map((item) => (
                      <li key={item.id} className={`evidence-item${item.contradictionGroupId ? " evidence-item--contradiction" : ""}`}>
                        <div className="evidence-item__header">
                          <span className="evidence-item__value">
                            {formatEvidenceValue(item.normalizedValue)}
                          </span>
                          <span className="evidence-item__method">
                            {t(evidenceMethodKey(item.extractionMethod) as never)}
                          </span>
                        </div>
                        <p className="evidence-item__wording">
                          {t("evidenceOriginalWording")}: {item.originalOcrWording}
                        </p>
                        <p className="evidence-item__source">
                          {t("evidencePage")}: {item.pageNumber}
                          {item.confidence !== undefined
                            ? ` · ${t("evidenceConfidence")}: ${Math.round(item.confidence * 100)}%`
                            : ""}
                        </p>
                        {item.contradictionGroupId && (
                          <p className="evidence-item__note">{t("evidenceContradiction")}</p>
                        )}
                        {item.uncertaintyNotes && !item.contradictionGroupId && (
                          <p className="evidence-item__note">{t("evidenceUncertainty")}</p>
                        )}
                        <p className={`evidence-item__status evidence-item__status--${item.verificationState.toLowerCase()}`}>
                          {item.verificationState === "ACCEPTED"
                            ? t("evidenceAccepted")
                            : item.verificationState === "REJECTED"
                              ? t("evidenceRejected")
                              : t("evidencePending")}
                        </p>
                        <div className="evidence-item__actions">
                          <button
                            type="button"
                            className="evidence-button evidence-button--accept"
                            onClick={() => handleReviewItem(document.id, item.id, "ACCEPTED")}
                          >
                            {t("evidenceAccept")}
                          </button>
                          <button
                            type="button"
                            className="evidence-button evidence-button--reject"
                            onClick={() => handleReviewItem(document.id, item.id, "REJECTED")}
                          >
                            {t("evidenceReject")}
                          </button>
                          {item.verificationState !== "UNVERIFIED" && (
                            <button
                              type="button"
                              className="evidence-button evidence-button--reset"
                              onClick={() => handleReviewItem(document.id, item.id, "UNVERIFIED")}
                            >
                              {t("evidenceReset")}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      );
    }

    return null;
  }

  async function submitToDoctor() {
    if (completing || completion) return;
    setCompleting(true);
    setCompletionError("");
    try {
      // Canonical completion: safety-signal detection + clinical summary +
      // AWAITING_REVIEW / URGENT_REVIEW transition, in one transaction.
      const response = await fetch("/api/patient/complete", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { caseId?: string; caseStatus?: string };
      if (response.ok || response.status === 410) {
        setCompletion({ caseId: data.caseId ?? null, caseStatus: data.caseStatus ?? "AWAITING_REVIEW" });
      } else {
        setCompletionError(t("errorDescription"));
      }
    } catch {
      setCompletionError(t("errorDescription"));
    } finally {
      setCompleting(false);
    }
  }

  if (completion) {
    return (
      <section className="flow-screen documents-screen" aria-labelledby="documents-complete-title">
        <div className="completion-card" role="status">
          <span className="completion-card__icon" aria-hidden="true">✓</span>
          <h1 id="documents-complete-title">{t("completeTitle")}</h1>
          <p className="lead-copy">{t("completeDescription")}</p>
          {completion.caseStatus === "URGENT_REVIEW" && (
            <p className="completion-card__urgent" role="alert">{t("completeUrgent")}</p>
          )}
          {completion.caseId && (
            <p className="completion-card__case">
              {t("completeCaseLabel")}: <strong>{completion.caseId}</strong>
            </p>
          )}
          <div className="primary-action-stack">
            <button type="button" className="primary-button" onClick={() => void resetPatientFlow()}>
              {t("completeNextPatient")} <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flow-screen" aria-labelledby="documents-title">
      <p className="eyebrow">{t("documentsStep")}</p>
      <h1 id="documents-title">{t("documentsTitle")}</h1>
      <p className="lead-copy">{t("documentsHelper")}</p>

      <div className="documents-card">
        <div className="document-upload">
          <label htmlFor="document-file-input" className="document-upload__label">
            {t("documentSelect")}
          </label>
          <input
            id="document-file-input"
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tiff"
            onChange={handleFileChange}
            className="document-upload__input"
            disabled={isUploading}
          />

          {selectedFile && (
            <div className="document-upload__preview" aria-live="polite">
              <p className="document-upload__filename">{selectedFile.name}</p>
              <p className="document-upload__meta">
                {SUPPORTED_DISPLAY_TYPES[selectedFile.type] || selectedFile.type || "Unknown"} • {formatFileSize(selectedFile.size)}
              </p>
              <div className="document-upload__actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleUpload}
                  disabled={isUploading}
                >
                  {isUploading ? t("documentUploading") : t("documentUpload")}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={removeSelectedFile}
                  disabled={isUploading}
                >
                  {t("documentRemove")}
                </button>
              </div>
            </div>
          )}

          {uploadError && (
            <p className="document-upload__error" role="alert">
              {uploadError}
            </p>
          )}
        </div>

        {workflow.documents.length > 0 && (
          <div className="documents-list">
            <h2>{t("documentsListTitle")}</h2>
            <ul>
              {workflow.documents.map((document) => (
                <li key={document.id} className="document-item">
                  <div className="document-item__info">
                    <span className="document-item__name">{document.originalFilename}</span>
                    <span className="document-item__meta">
                      {SUPPORTED_DISPLAY_TYPES[document.mimeType] || document.mimeType} • {document.processingStatus}
                    </span>
                    {document.ocrStatus !== "NOT_STARTED" && (
                      <span className="document-item__ocr-status">
                        OCR: {document.ocrStatus}
                      </span>
                    )}
                  </div>
                  <div className="document-item__actions">
                    {document.processingStatus === "RECEIVED" || document.processingStatus === "READY_FOR_OCR" ? (
                      <button
                        type="button"
                        className="primary-button primary-button--compact"
                        onClick={() => handleStartOcr(document.id)}
                        disabled={isUploading}
                      >
                        {t("documentStartOcr")}
                      </button>
                    ) : document.processingStatus === "FAILED" ? (
                      <button
                        type="button"
                        className="primary-button primary-button--compact"
                        onClick={() => handleRetryOcr(document.id)}
                        disabled={isUploading}
                      >
                        {t("documentRetryOcr")}
                      </button>
                    ) : null}
                    {document.processingStatus === "OCR_PROCESSING" && (
                      <button
                        type="button"
                        className="primary-button primary-button--compact"
                        onClick={() => handleRefreshOcrStatus(document.id)}
                        disabled={isUploading}
                      >
                        {t("documentRefreshStatus")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="document-item__remove"
                      onClick={() => handleRemoveDocument(document.id)}
                      aria-label={`Remove ${document.originalFilename}`}
                    >
                      {t("documentRemove")}
                    </button>
                  </div>
                  {renderExtractionSection(document)}
                  {document.ocrResults && document.ocrResults.length > 0 && (
                    <div className="document-item__ocr-results">
                      {document.ocrResults.map((result, index) => (
                        <div key={index} className="ocr-result">
                          <p className="ocr-result__meta">
                            {t("documentOcrProvider")}: {result.providerMetadata.provider}
                            {result.providerMetadata.language && ` • ${result.providerMetadata.language}`}
                          </p>
                          {result.handwritingDetected && (
                            <p className="ocr-result__handwriting">{t("documentHandwritingDetected")}</p>
                          )}
                          {result.pages.map((page) => (
                            <div key={page.pageNumber} className="ocr-page">
                              <p className="ocr-page__header">
                                {t("documentPage")} {page.pageNumber}
                                {page.confidence !== undefined && ` • ${Math.round(page.confidence * 100)}% ${t("documentConfidence")}`}
                              </p>
                              <p className="ocr-page__text">{page.extractedText || t("documentNoTextExtracted")}</p>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="primary-action-stack">
        <button
          type="button"
          className="primary-button"
          disabled={completing}
          aria-busy={completing}
          onClick={() => void submitToDoctor()}
        >
          {completing ? t("completing") : t("completeSubmit")} <span aria-hidden="true">→</span>
        </button>
        {completionError && (
          <p className="complaint-helper" role="alert">{completionError}</p>
        )}
        <button type="button" className="secondary-button" onClick={() => void resetPatientFlow()}>
          {t("newPatient")}
        </button>
      </div>
    </section>
  );
}
