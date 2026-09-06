import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page from "./page";

describe("MediKiosk shell", () => {
  it("renders patient and doctor product surfaces", () => {
    render(<Page />);

    expect(screen.getByText(/medikiosk/i)).toBeInTheDocument();
    expect(screen.getByText(/patient kiosk/i)).toBeInTheDocument();
    expect(screen.getByText(/doctor console/i)).toBeInTheDocument();
  });
});
