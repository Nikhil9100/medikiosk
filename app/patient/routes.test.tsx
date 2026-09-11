import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatientShell, PatientContext, usePatientWorkflow } from "./PatientShell";
import { bootstrapPatientSession, resetPatientSession } from "@/lib/patient-session-client";
import { createDocumentRecord } from "@/lib/documents";
import LanguagePage from "./language/page";
import ConsentPage from "./consent/page";
import ComplaintPage from "./complaint/page";
import AnatomyPage from "./anatomy/page";
import SymptomsPage from "./symptoms/page";
import DocumentsPage from "./documents/page";
import { getMissingTranslationKeys, getTranslation } from "@/lib/i18n";
import type { PatientWorkflow, ConsentStatus, PatientLanguage } from "@/lib/patient-flow";
import type { TranslationKey } from "@/lib/i18n";

const router = { push: vi.fn(), replace: vi.fn() };
let pathname = "/patient/language";
const languageNameKeys = {
  en: "languageEnglish",
  hi: "languageHindi",
  bn: "languageBengali",
  te: "languageTelugu",
  ta: "languageTamil",
  mr: "languageMarathi",
} as const;
const translatedOnboardingKeys = [
  "serviceName",
  "welcomeTitle",
  "welcomeDescription",
  "start",
  "needHelp",
  "chooseLanguage",
  "chooseLanguageSecondary",
  "consentTitle",
  "consentIntro",
  "consentPointOne",
  "consentPointTwo",
  "consentPointThree",
  "consentAgree",
  "consentBack",
  "consentReadMore",
  "consentDetails",
  "consentDeclined",
  "startTitle",
  "startDescription",
  "startNote",
  "languageStep",
  "consentStep",
  "startStep",
  "progressLabel",
  "helpTitle",
  "helpDescription",
  "close",
  "languageSaved",
  "loading",
  "errorTitle",
  "errorDescription",
  "tryAgain",
  "documentsStep",
  "documentsTitle",
  "documentsHelper",
  "documentSelect",
  "documentUpload",
  "documentsListTitle",
] as const;

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => router,
}));

vi.mock("@/lib/patient-session-client", () => ({
  bootstrapPatientSession: vi.fn(() => Promise.resolve({ id: "bootstrapped-session" })),
  updatePatientSession: vi.fn(() => Promise.resolve({})),
  resetPatientSession: vi.fn(() => Promise.resolve({ reset: true, session: null, deletedDocuments: 0 })),
}));

function createMockWorkflow(overrides: Partial<PatientWorkflow> = {}): PatientWorkflow {
  return {
    language: "en",
    currentStep: "complaint",
    consentStatus: "ACCEPTED",
    sessionId: "test-session",
    complaint: "",
    selectedRegion: null,
    selectedSubregion: null,
    interviewFacts: {},
    documents: [],
    ...overrides,
  };
}

function renderWithMockShell(ui: React.ReactNode, workflowOverrides: Partial<PatientWorkflow> = {}) {
  const initialWorkflow = createMockWorkflow(workflowOverrides);

  function MockShell({ children }: { children: React.ReactNode }) {
    const [workflow, setWorkflow] = useState(initialWorkflow);

    const value = {
      workflow,
      setLanguage: (language: PatientLanguage) => setWorkflow(prev => ({ ...prev, language })),
      setConsentStatus: (status: ConsentStatus) => setWorkflow(prev => ({ ...prev, consentStatus: status })),
      setComplaint: (complaint: string) => setWorkflow(prev => ({ ...prev, complaint })),
      setSelectedRegion: (region: PatientWorkflow["selectedRegion"]) => setWorkflow(prev => ({ ...prev, selectedRegion: region })),
      setSelectedSubregion: (subregion: PatientWorkflow["selectedSubregion"]) => setWorkflow(prev => ({ ...prev, selectedSubregion: subregion })),
      setInterviewFact: vi.fn(),
      setDocuments: vi.fn(),
      syncSession: vi.fn().mockResolvedValue(true),
      resetPatientFlow: vi.fn(),
      t: (key: TranslationKey) => key,
      openHelp: vi.fn(),
    } as {
      workflow: PatientWorkflow;
      setLanguage: (language: PatientLanguage) => void;
      setConsentStatus: (status: ConsentStatus) => void;
      setComplaint: (complaint: string) => void;
      setSelectedRegion: (region: PatientWorkflow["selectedRegion"]) => void;
      setSelectedSubregion: (subregion: PatientWorkflow["selectedSubregion"]) => void;
      setInterviewFact: (questionId: string, value: string | undefined, provenance?: string) => void;
      setDocuments: (documents: PatientWorkflow["documents"]) => void;
      syncSession: (payload: Partial<Record<string, unknown>>) => Promise<boolean>;
      resetPatientFlow: () => Promise<void>;
      t: (key: TranslationKey) => string;
      openHelp: () => void;
    };

    return (
      <PatientContext.Provider value={value}>
        {children}
      </PatientContext.Provider>
    );
  }

  return render(<MockShell>{ui}</MockShell>);
}

function SessionProbe() {
  const { workflow } = usePatientWorkflow();
  return <span data-testid="sessionId">{workflow.sessionId}</span>;
}

function makeDocumentRecord(sessionId: string) {
  return createDocumentRecord(sessionId, new File(["%PDF-1.4"], "patient-a.pdf", { type: "application/pdf" }));
}

function IsolationProbe() {
  const {
    workflow,
    setLanguage,
    setComplaint,
    setSelectedRegion,
    setSelectedSubregion,
    setInterviewFact,
    setDocuments,
    resetPatientFlow,
  } = usePatientWorkflow();

  return (
    <div>
      <span data-testid="iso-sessionId">{workflow.sessionId}</span>
      <span data-testid="iso-language">{workflow.language}</span>
      <span data-testid="iso-complaint">{workflow.complaint}</span>
      <span data-testid="iso-region">{workflow.selectedRegion ?? ""}</span>
      <span data-testid="iso-subregion">{workflow.selectedSubregion ?? ""}</span>
      <span data-testid="iso-facts">{Object.keys(workflow.interviewFacts).join(",")}</span>
      <span data-testid="iso-docs">{workflow.documents.length}</span>
      <button type="button" onClick={() => setLanguage("ta")}>seed-language</button>
      <button type="button" onClick={() => setComplaint("Patient A severe headache")}>seed-complaint</button>
      <button type="button" onClick={() => setSelectedRegion("head")}>seed-region</button>
      <button type="button" onClick={() => setSelectedSubregion("face")}>seed-subregion</button>
      <button type="button" onClick={() => setInterviewFact("q1", "yes")}>seed-fact</button>
      <button type="button" onClick={() => setDocuments([makeDocumentRecord(workflow.sessionId)])}>seed-doc</button>
      <button type="button" onClick={() => void resetPatientFlow()}>reset-flow</button>
    </div>
  );
}

describe("patient onboarding routes", () => {
  beforeEach(() => {
    pathname = "/patient/language";
    router.push.mockReset();
    router.replace.mockReset();
    window.localStorage.clear();
    vi.mocked(bootstrapPatientSession).mockClear();
    vi.mocked(resetPatientSession).mockClear();
  });

  it.each(["en", "hi", "bn", "te", "ta", "mr"] as const)("persists %s across language and consent routes", async (language) => {
    render(
      <PatientShell>
        <LanguagePage />
      </PatientShell>,
    );

    const languageLabel = getTranslation(language, languageNameKeys[language]);
    const languageGroup = screen.getByRole("group", { name: "Choose your language" });
    const languageOption = within(languageGroup).getByRole("button", { name: new RegExp(languageLabel) });
    await waitFor(() => expect(languageOption).toBeInTheDocument());
    fireEvent.click(languageOption);

    expect(window.localStorage.getItem("medikiosk.patient.language")).toBe(language);
    expect(router.push).toHaveBeenCalledWith("/patient/consent");
  });

  it("requires explicit consent before navigating to start", async () => {
    pathname = "/patient/consent";
    render(
      <PatientShell>
        <ConsentPage />
      </PatientShell>,
    );

    const continueButton = await screen.findByRole("button", { name: /I Agree & Continue/ });
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);

    // Consent is persisted before the flow advances (durable record).
    const { updatePatientSession } = await import("@/lib/patient-session-client");
    await waitFor(() => expect(updatePatientSession).toHaveBeenCalledWith({ consentStatus: "ACCEPTED" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/patient/start"));
  });

  it("does not advance to start when consent cannot be persisted", async () => {
    const { updatePatientSession } = await import("@/lib/patient-session-client");
    vi.mocked(updatePatientSession).mockRejectedValueOnce(new Error("storage unavailable"));
    pathname = "/patient/consent";
    render(
      <PatientShell>
        <ConsentPage />
      </PatientShell>,
    );

    const continueButton = await screen.findByRole("button", { name: /I Agree & Continue/ });
    fireEvent.click(continueButton);

    await waitFor(() => expect(updatePatientSession).toHaveBeenCalledWith({ consentStatus: "ACCEPTED" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(router.push).not.toHaveBeenCalledWith("/patient/start");
  });

  it("takes the consent back action to language selection without acceptance", async () => {
    pathname = "/patient/consent";
    render(
      <PatientShell>
        <ConsentPage />
      </PatientShell>,
    );

    const backButtons = await screen.findAllByRole("button", { name: /Go back/ });
    fireEvent.click(backButtons[0]);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(router.push).toHaveBeenCalledWith("/patient/language");
  });

  it("has complete copy for every supported patient language", () => {
    for (const language of ["en", "hi", "bn", "te", "ta", "mr"] as const) {
      expect(getMissingTranslationKeys(language)).toEqual([]);
      if (language !== "en") {
        expect(getTranslation(language, "homeLabel")).not.toContain(" home");
        for (const key of translatedOnboardingKeys) {
          expect(getTranslation(language, key)).not.toBe(getTranslation("en", key));
        }
      }
    }
  });

  it("renders the complaint step and keeps the initial complaint state explicit", async () => {
    pathname = "/patient/complaint";
    renderWithMockShell(<ComplaintPage />);

    expect(await screen.findByRole("textbox", { name: /complaintPrompt/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /complaintTitle/i })).toBeInTheDocument();
    const textarea = screen.getByRole("textbox", { name: /complaintPrompt/i });
    expect(textarea).toHaveValue("");
  });

  it("requires no body region by default and allows a valid regional selection", async () => {
    pathname = "/patient/anatomy";
    renderWithMockShell(<AnatomyPage />, {
      language: "en",
      currentStep: "anatomy",
      consentStatus: "ACCEPTED",
      sessionId: "test-session",
      complaint: "",
      selectedRegion: null,
      selectedSubregion: null,
      interviewFacts: {},
    });

    expect(screen.getByText(/anatomyPrompt/i)).toBeInTheDocument();
    // The region list is the accessible fallback; the SVG figure exposes the
    // same regions as separate role="button" nodes, so scope to the list.
    // Mock shell t() returns keys verbatim, so the aria-label is the key.
    const regionList = screen.getByRole("list", { name: /regionListLabel/i });
    const headButton = within(regionList).getByRole("button", { name: /head/i });
    expect(headButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(headButton);
    expect(within(regionList).getByRole("button", { name: /head/i })).toHaveAttribute("aria-pressed", "true");
  });

  describe("other symptoms step (multiple complaints)", () => {
    const baseOverrides: Partial<PatientWorkflow> = {
      language: "en",
      currentStep: "symptoms",
      consentStatus: "ACCEPTED",
      sessionId: "test-session",
      complaint: "chief complaint text",
      selectedRegion: "head",
      selectedSubregion: "face",
      interviewFacts: {},
    };

    function mockComplaintsApi(existing: Array<{ id: string; position: number; complaintText: string; bodyRegion?: string | null; severity?: string | null }>) {
      const calls: Array<{ method: string; body: unknown }> = [];
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (method === "GET" && url.includes("/api/patient/complaints")) {
          return { ok: true, json: async () => ({ complaints: existing }) };
        }
        if (method === "POST" && url.includes("/api/patient/complaints")) {
          calls.push({ method, body: JSON.parse(String(init?.body)) });
          return { ok: true, json: async () => ({ complaint: { id: "new-id" } }) };
        }
        if (method === "DELETE" && url.includes("/api/patient/complaints")) {
          calls.push({ method, body: JSON.parse(String(init?.body)) });
          return { ok: true, json: async () => ({ ok: true }) };
        }
        return { ok: true, json: async () => ({}) };
      });
      vi.stubGlobal("fetch", fetchMock);
      return calls;
    }

    it("renders the chief complaint, offers adding a symptom, and persists additions with severity", async () => {
      pathname = "/patient/symptoms";
      const calls = mockComplaintsApi([
        { id: "c1", position: 1, complaintText: "chief complaint text", bodyRegion: "head", severity: "SEVERE" },
      ]);
      renderWithMockShell(<SymptomsPage />, baseOverrides as PatientWorkflow);

      expect(await screen.findByRole("heading", { name: /symptomsTitle/i })).toBeInTheDocument();
      // Chief complaint is shown read-only with its label key.
      expect(screen.getByText(/symptomsChiefLabel/i)).toBeInTheDocument();
      expect(screen.getByText("chief complaint text")).toBeInTheDocument();

      const addButton = await screen.findByRole("button", { name: /symptomAdd/i });
      fireEvent.click(addButton);
      const input = await screen.findByRole("textbox", { name: /symptomPrompt/i });
      fireEvent.change(input, { target: { value: "dizziness since yesterday" } });
      // Severity picker is scoped to its group; mock t() returns keys verbatim.
      const severityGroup = screen.getByRole("group", { name: /severityLabel/i });
      fireEvent.click(within(severityGroup).getByRole("button", { name: /severityModerate/i }));
      fireEvent.click(screen.getByRole("button", { name: /symptomAdd/i }));

      await waitFor(() => {
        expect(calls).toHaveLength(1);
      });
      expect(calls[0].method).toBe("POST");
      expect(calls[0].body).toMatchObject({
        complaintText: "dizziness since yesterday",
        severity: "MODERATE",
      });
    });

    it("caps extra symptoms at three and explains the limit", async () => {
      pathname = "/patient/symptoms";
      mockComplaintsApi([
        { id: "c1", position: 1, complaintText: "chief", bodyRegion: null, severity: null },
        { id: "c2", position: 2, complaintText: "extra one", bodyRegion: null, severity: null },
        { id: "c3", position: 3, complaintText: "extra two", bodyRegion: null, severity: null },
        { id: "c4", position: 4, complaintText: "extra three", bodyRegion: null, severity: null },
      ]);
      renderWithMockShell(<SymptomsPage />, baseOverrides as PatientWorkflow);

      expect(await screen.findByText("extra one")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /symptomAdd/i })).not.toBeInTheDocument();
      expect(screen.getByText(/symptomsLimit/i)).toBeInTheDocument();
    });

    it("removes an extra symptom via DELETE (chief complaint stays anchored)", async () => {
      pathname = "/patient/symptoms";
      const calls = mockComplaintsApi([
        { id: "c1", position: 1, complaintText: "chief", bodyRegion: null, severity: null },
        { id: "c2", position: 2, complaintText: "extra one", bodyRegion: null, severity: null },
      ]);
      renderWithMockShell(<SymptomsPage />, baseOverrides as PatientWorkflow);

      const removeButton = await screen.findByRole("button", { name: /symptomsRemove/i });
      fireEvent.click(removeButton);
      await waitFor(() => {
        expect(calls).toHaveLength(1);
      });
      expect(calls[0].method).toBe("DELETE");
      expect(calls[0].body).toEqual({ complaintId: "c2" });
    });
  });

  it("renders the documents step with upload control", async () => {
    pathname = "/patient/documents";
    renderWithMockShell(<DocumentsPage />, {
      language: "en",
      currentStep: "documents",
      consentStatus: "ACCEPTED",
      sessionId: "test-session",
      complaint: "",
      selectedRegion: null,
      selectedSubregion: null,
      interviewFacts: {},
      documents: [],
    });

    expect(screen.getByText(/documentsTitle/i)).toBeInTheDocument();
    expect(screen.getByText(/documentsHelper/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/documentSelect/i)).toBeInTheDocument();
  });

  it("establishes the server session on startup and reconciles the local workflow session id", async () => {
    pathname = "/patient";
    render(
      <PatientShell>
        <SessionProbe />
      </PatientShell>,
    );

    await waitFor(() => expect(screen.getByTestId("sessionId")).toHaveTextContent("bootstrapped-session"));
  });

  it("surfaces a recoverable session error when bootstrap fails and recovers on retry", async () => {
    pathname = "/patient";
    vi.mocked(bootstrapPatientSession).mockRejectedValueOnce(new Error("offline"));

    render(
      <PatientShell>
        <SessionProbe />
      </PatientShell>,
    );

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent(/Please try again or ask a member of staff for help/i);

    fireEvent.click(within(banner).getByRole("button", { name: /Try again/i }));

    await waitFor(() => expect(screen.getByTestId("sessionId")).toHaveTextContent("bootstrapped-session"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the patient flow interactive during session bootstrap failures", async () => {
    pathname = "/patient";
    vi.mocked(bootstrapPatientSession).mockRejectedValue(new Error("offline"));

    render(
      <PatientShell>
        <span>flow-content</span>
      </PatientShell>,
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("flow-content")).toBeInTheDocument();
  });

  it("starts Patient B with no trace of Patient A clinical state after the new-patient reset", async () => {
    pathname = "/patient";
    vi.mocked(bootstrapPatientSession)
      .mockReset()
      .mockResolvedValueOnce({ id: "session-patient-a" })
      .mockResolvedValueOnce({ id: "session-patient-b" });

    render(
      <PatientShell>
        <IsolationProbe />
      </PatientShell>,
    );

    // Patient A's session is established on startup.
    await waitFor(() => expect(screen.getByTestId("iso-sessionId")).toHaveTextContent("session-patient-a"));

    // Patient A records complaint, anatomy, interview fact and a document.
    fireEvent.click(screen.getByRole("button", { name: "seed-complaint" }));
    fireEvent.click(screen.getByRole("button", { name: "seed-region" }));
    fireEvent.click(screen.getByRole("button", { name: "seed-subregion" }));
    fireEvent.click(screen.getByRole("button", { name: "seed-fact" }));
    fireEvent.click(screen.getByRole("button", { name: "seed-doc" }));

    expect(screen.getByTestId("iso-complaint")).toHaveTextContent("Patient A severe headache");
    expect(screen.getByTestId("iso-region")).toHaveTextContent("head");
    expect(screen.getByTestId("iso-subregion")).toHaveTextContent("face");
    expect(screen.getByTestId("iso-facts")).toHaveTextContent("q1");
    expect(screen.getByTestId("iso-docs")).toHaveTextContent("1");

    // Invoke the new-patient reset lifecycle.
    fireEvent.click(screen.getByRole("button", { name: "reset-flow" }));

    await waitFor(() => expect(screen.getByTestId("iso-sessionId")).toHaveTextContent("session-patient-b"));

    // Patient B inherits none of Patient A's clinical state.
    expect(screen.getByTestId("iso-sessionId")).not.toHaveTextContent("session-patient-a");
    expect(screen.getByTestId("iso-complaint")).toHaveTextContent("");
    expect(screen.getByTestId("iso-region")).toHaveTextContent("");
    expect(screen.getByTestId("iso-subregion")).toHaveTextContent("");
    expect(screen.getByTestId("iso-facts")).toHaveTextContent("");
    expect(screen.getByTestId("iso-docs")).toHaveTextContent("0");
    expect(screen.getByTestId("iso-language")).toHaveTextContent("en");

    // The server reset lifecycle ran and the shell navigated to the welcome screen.
    expect(resetPatientSession).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/patient");
  });

  it("preserves the kiosk language preference and remains clean across repeated resets", async () => {
    pathname = "/patient";
    vi.mocked(bootstrapPatientSession)
      .mockReset()
      .mockResolvedValueOnce({ id: "session-patient-a" })
      .mockResolvedValueOnce({ id: "session-patient-b" })
      .mockResolvedValueOnce({ id: "session-patient-c" });

    render(
      <PatientShell>
        <IsolationProbe />
      </PatientShell>,
    );

    await waitFor(() => expect(screen.getByTestId("iso-sessionId")).toHaveTextContent("session-patient-a"));

    fireEvent.click(screen.getByRole("button", { name: "seed-language" }));
    fireEvent.click(screen.getByRole("button", { name: "seed-complaint" }));
    expect(screen.getByTestId("iso-language")).toHaveTextContent("ta");

    // A repeated reset (double-click / staff pressing New patient twice) must be
    // idempotent: each pass clears Patient A's state and establishes a fresh,
    // clean session without any leakage into the next session.
    fireEvent.click(screen.getByRole("button", { name: "reset-flow" }));
    await waitFor(() => expect(screen.getByTestId("iso-sessionId")).toHaveTextContent("session-patient-b"));
    expect(screen.getByTestId("iso-complaint")).toHaveTextContent("");

    fireEvent.click(screen.getByRole("button", { name: "reset-flow" }));
    await waitFor(() => expect(screen.getByTestId("iso-sessionId")).toHaveTextContent("session-patient-c"));

    // Language is preserved (kiosk-level setting) and no Patient A state leaks.
    expect(screen.getByTestId("iso-language")).toHaveTextContent("ta");
    expect(screen.getByTestId("iso-complaint")).toHaveTextContent("");
    expect(screen.getByTestId("iso-docs")).toHaveTextContent("0");
    expect(screen.getByTestId("iso-sessionId")).not.toHaveTextContent("session-patient-a");
    expect(resetPatientSession).toHaveBeenCalledTimes(2);
  });
});
