import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatientShell, PatientContext, usePatientWorkflow } from "./PatientShell";
import { bootstrapPatientSession } from "@/lib/patient-session-client";
import LanguagePage from "./language/page";
import ConsentPage from "./consent/page";
import ComplaintPage from "./complaint/page";
import AnatomyPage from "./anatomy/page";
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
      syncSession: vi.fn(),
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
      syncSession: (payload: Partial<Record<string, unknown>>) => Promise<void>;
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

describe("patient onboarding routes", () => {
  beforeEach(() => {
    pathname = "/patient/language";
    router.push.mockReset();
    router.replace.mockReset();
    window.localStorage.clear();
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

    expect(router.push).toHaveBeenCalledWith("/patient/start");
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
    const headButton = screen.getByRole("button", { name: /head/i });
    expect(headButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(headButton);
    expect(screen.getByRole("button", { name: /head/i })).toHaveAttribute("aria-pressed", "true");
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
});
