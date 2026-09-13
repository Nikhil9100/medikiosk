import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import PatientAnatomyPage from "./page";
import { PatientContext, type Context } from "../PatientShell";
import { defaultWorkflow, type PatientWorkflow } from "@/lib/patient-flow";
import { t as translate, type TranslationKey } from "@/lib/i18n";

// Mock router
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

describe("PatientAnatomyPage with Lazarus Integration", () => {
  const t = (key: TranslationKey) => translate("en", key);

  function renderPage(initialWorkflow: PatientWorkflow = defaultWorkflow) {
    const setWorkflow = vi.fn();
    const sync = vi.fn().mockResolvedValue(true);
    const mutate = vi.fn().mockResolvedValue({ ok: true, queued: false, status: 200 });

    const contextValue: Context = {
      workflow: initialWorkflow,
      setWorkflow,
      sync,
      mutate,
      ensureSynced: vi.fn().mockResolvedValue(true),
      beginSession: vi.fn().mockResolvedValue(true),
      finishOfflineCase: vi.fn().mockResolvedValue(undefined),
      t,
      setLanguage: vi.fn(),
      reset: vi.fn().mockResolvedValue(true),
      saveDraft: vi.fn().mockResolvedValue(undefined),
      loadDraft: vi.fn().mockResolvedValue(null),
      clearDraft: vi.fn().mockResolvedValue(undefined),
      connection: "online",
      pendingCount: 0,
      queuedBodies: vi.fn().mockResolvedValue([]),
    };

    const utils = render(
      <PatientContext.Provider value={contextValue}>
        <PatientAnatomyPage />
      </PatientContext.Provider>,
    );

    return { ...utils, setWorkflow, sync, mutate };
  }

  it("renders both Standard view and Pinpoint view toggles", () => {
    renderPage();
    expect(screen.getByText(t("standardDiagram"))).toBeInTheDocument();
    expect(screen.getByText(`🔍 ${t("pinpointSelector")}`)).toBeInTheDocument();
  });

  it("defaults to standard 2D diagram mode with Front/Back toggle", () => {
    renderPage();
    expect(screen.getByRole("tab", { name: t("frontView") || "Front" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: t("backView") || "Back" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Body diagram orientation" })).toBeInTheDocument();
  });

  it("switches to Lazarus pinpoint view when the toggle is clicked", async () => {
    renderPage();
    const pinpointButton = screen.getByText(`🔍 ${t("pinpointSelector")}`);
    fireEvent.click(pinpointButton);

    expect(await screen.findByLabelText(t("pinpointSelector"))).toBeInTheDocument();
    expect(screen.getByText(t("zoomInstruction"))).toBeInTheDocument();
  });

  it("maintains accessible text checklist in both modes", async () => {
    renderPage();
    expect(screen.getByRole("group", { name: "Body region selection list" })).toBeInTheDocument();

    // Switch to pinpoint
    fireEvent.click(screen.getByText(`🔍 ${t("pinpointSelector")}`));
    expect(await screen.findByLabelText(t("pinpointSelector"))).toBeInTheDocument();

    // Checklist is still present and accessible
    const checklist = screen.getByRole("group", { name: "Body region selection list" });
    expect(within(checklist).getByRole("button", { name: /Chest/i })).toBeInTheDocument();
  });

  it("returns to standard diagram when return button is clicked", async () => {
    renderPage();
    fireEvent.click(screen.getByText(`🔍 ${t("pinpointSelector")}`));
    expect(await screen.findByLabelText(t("pinpointSelector"))).toBeInTheDocument();

    const returnBtn = screen.getByLabelText(t("cancelPinpoint"));
    fireEvent.click(returnBtn);

    expect(screen.getByRole("tablist", { name: "Body diagram orientation" })).toBeInTheDocument();
  });

  it("clicking checklist item in either mode selects the region", () => {
    renderPage();
    const checklist = screen.getByRole("group", { name: "Body region selection list" });
    const chestButton = within(checklist).getByRole("button", { name: /Chest/i });
    fireEvent.click(chestButton);

    expect(chestButton).toHaveAttribute("aria-pressed", "true");
  });
});
