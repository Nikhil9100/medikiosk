import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatientShell } from "./PatientShell";
import LanguagePage from "./language/page";
import ConsentPage from "./consent/page";

const router = { push: vi.fn(), replace: vi.fn() };
let pathname = "/patient/language";

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

  it("selects Hindi and navigates without losing the selected language", async () => {
    render(
      <PatientShell>
        <LanguagePage />
      </PatientShell>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /हिंदी/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /हिंदी/ }));

    expect(window.localStorage.getItem("medikiosk.patient.language")).toBe("hi");
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

  it("takes a declined consent decision back to language selection", async () => {
    pathname = "/patient/consent";
    render(
      <PatientShell>
        <ConsentPage />
      </PatientShell>,
    );

    const backButtons = await screen.findAllByRole("button", { name: /Go back/ });
    fireEvent.click(backButtons[0]);

    expect(router.push).toHaveBeenCalledWith("/patient/language");
  });
});
