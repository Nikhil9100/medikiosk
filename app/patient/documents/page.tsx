"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePatientWorkflow } from "../PatientShell";
import {
  isSupportedMimeType,
  validateFileSize,
} from "@/lib/documents";

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
  const router = useRouter();
  const { workflow, setDocuments, syncSession, t } = usePatientWorkflow();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        ocrStatus: "NOT_STARTED" | "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
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
      };
      const updatedDocuments = [...workflow.documents, document];
      setDocuments(updatedDocuments);
      void syncSession({ documents: updatedDocuments as unknown as Array<Record<string, unknown>> });
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
    void syncSession({ documents: updatedDocuments as unknown as Array<Record<string, unknown>> });
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
                  </div>
                  <button
                    type="button"
                    className="document-item__remove"
                    onClick={() => handleRemoveDocument(document.id)}
                    aria-label={`Remove ${document.originalFilename}`}
                  >
                    {t("documentRemove")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="primary-action-stack">
        <button type="button" className="primary-button" onClick={() => router.push("/patient")}>
          {t("documentsComplete")} <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}
