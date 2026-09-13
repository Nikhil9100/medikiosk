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

  it("renders precision holographic body model directly without standard view toggles", () => {
    renderPage();
    expect(screen.getByLabelText(t("pinpointSelector"))).toBeInTheDocument();
    expect(screen.queryByText(t("standardDiagram"))).not.toBeInTheDocument();
    expect(screen.getByText(t("zoomInstruction"))).toBeInTheDocument();
  });

  it("renders Front/Back view toggles with tablist accessibility", () => {
    renderPage();
    expect(screen.getByRole("tab", { name: t("frontView") || "Front" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: t("backView") || "Back" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Body diagram orientation" })).toBeInTheDocument();
  });

  it("maintains accessible text checklist alongside pinpoint body model", () => {
    renderPage();
    const checklist = screen.getByRole("group", { name: "Body region selection list" });
    expect(checklist).toBeInTheDocument();
    expect(within(checklist).getByRole("button", { name: /Chest/i })).toBeInTheDocument();
  });

  it("clicking checklist item selects the region", () => {
    renderPage();
    const checklist = screen.getByRole("group", { name: "Body region selection list" });
    const chestButton = within(checklist).getByRole("button", { name: /Chest/i });
    fireEvent.click(chestButton);

    expect(chestButton).toHaveAttribute("aria-pressed", "true");
  });

  it("uses gender-neutral holographic figure and removes male/female selectors", async () => {
    renderPage();
    expect(await screen.findByLabelText(t("pinpointSelector"))).toBeInTheDocument();

    // Verify neither Male nor Female toggle buttons exist
    expect(screen.queryByRole("button", { name: /male/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /female/i })).not.toBeInTheDocument();

    // Front view loads neutralFront.png
    const bodyImg = screen.getByAltText("Body diagram front view");
    expect(bodyImg).toHaveAttribute("src", "/lazarus/neutralFront.png");

    // Toggle to Back view
    const backBtn = screen.getByRole("tab", { name: t("backView") || "Back" });
    fireEvent.click(backBtn);

    const backImg = screen.getByAltText("Body diagram back view");
    expect(backImg).toHaveAttribute("src", "/lazarus/neutralBack.png");
  });
});
