"use client";

import { useEffect, useState } from "react";

export default function LargeTextToggle() {
  const [largeText, setLargeText] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("medikiosk-large-text") === "true";
      if (stored) {
        setLargeText(true);
        document.documentElement.classList.add("large-text");
      }
    }
  }, []);

  const toggle = () => {
    const next = !largeText;
    setLargeText(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("medikiosk-large-text", String(next));
      if (next) {
        document.documentElement.classList.add("large-text");
      } else {
        document.documentElement.classList.remove("large-text");
      }
    }
  };

  return (
    <div className="large-text-switch" role="group" aria-label="Display accessibility">
      <span className="large-text-prompt">Need a simpler screen?</span>
      <button
        type="button"
        className={`large-text-btn ${largeText ? "active" : ""}`}
        onClick={toggle}
        aria-pressed={largeText}
        aria-label="Toggle large text mode for simpler reading"
      >
        <span className="large-text-icon" aria-hidden="true">
          👁️
        </span>
        <strong>LARGE TEXT</strong>
        <span className="large-text-status-indicator" aria-hidden="true">
          {largeText ? "ON" : "OFF"}
        </span>
      </button>
    </div>
  );
}
