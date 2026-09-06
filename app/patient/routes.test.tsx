import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatientShell } from "./PatientShell";
import LanguagePage from "./language/page";
import ConsentPage from "./consent/page";
import { getMissingTranslationKeys, getTranslation } from "@/lib/i18n";

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
] as const;

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => router,
}));

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
});
