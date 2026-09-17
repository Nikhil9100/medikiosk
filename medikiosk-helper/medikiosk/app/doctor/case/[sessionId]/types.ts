/** Shape of GET /api/staff/case/[sessionId] — the live case bundle. */

export type BundleCase = {
  sessionId: string;
  caseId: string;
  caseStatus: string;
  language: string;
  demoFlag: boolean;
  consentStatus: string;
  createdAt: string;
  completedAt: string | null;
  doctorName: string | null;
  consultStartedAt: string | null;
};

export type BundleComplaint = {
  id: string;
  position: number;
  complaintText: string;
  bodyRegion: string | null;
  bodySubregion: string | null;
  severity: string | null;
  interviewData: Record<string, { questionId: string; value: string | null; state: string; provenance: string }> | null;
  createdAt: string;
};

export type GlobalHistoryGroup = {
  domain: string;
  facts: Array<{ questionId: string; value: string | null; state: string; provenance: string }>;
};

export type BundleDocument = {
  id: string;
  documentType: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  pageCount: number | null;
  ocrStatus: string;
  extractionStatus: string;
  aiProviderState: string | null;
  failureStage: string | null;
  verificationStatus: string | null;
  errors: unknown[] | null;
  createdAt: string;
  ocrResults: unknown[];
};

export type BundleEvidence = {
  id: string;
  documentId: string;
  sessionId: string;
  category: string;
  normalizedValue: Record<string, unknown>;
  originalOcrWording: string;
  pageNumber: number;
  ocrSpan: unknown;
  extractionMethod: string;
  provider: { name: string; createdAt?: string } | null;
  confidence?: number;
  verificationState: string;
  uncertaintyNotes?: string;
  contradictionGroupId?: string;
  verifiedBy?: string;
  verifiedAt?: string | null;
  verificationNote?: string;
  documentFilename?: string | null;
  documentOcrStatus?: string | null;
};

export type BundleSignal = {
  id: string;
  type: string;
  summary: string;
  reason: string;
  evidenceRef: string | null;
  source: string;
  status: string;
  reviewNote: string | null;
  reviewedAt: string | null;
};

export type BundleConsultation = {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  note: string | null;
  doctorName: string | null;
};

export type BundleNote = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
};

export type DashavidhaEntry = {
  observation: string;
  value: string | null;
  state: string;
  provenance: string;
  note: string | null;
  recordedAt: string | null;
  recordedBy: string | null;
};

export type CaseBundle = {
  case: BundleCase;
  complaints: BundleComplaint[];
  globalHistory: GlobalHistoryGroup[];
  documents: BundleDocument[];
  evidence: BundleEvidence[];
  signals: BundleSignal[];
  consultations: BundleConsultation[];
  notes: BundleNote[];
  dashavidha: Record<string, DashavidhaEntry>;
  chat: Array<{ id: string; role: string; content: string; intent: string | null; provider: string | null; createdAt: string }>;
  summary: Record<string, unknown> | null;
};
