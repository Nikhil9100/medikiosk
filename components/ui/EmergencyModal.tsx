"use client";

import { useEffect, useRef, useState } from "react";

export interface EmergencyModalProps {
  isOpen: boolean;
  onGetHelp: () => void;
  onAcknowledge: () => void;
  symptomReason?: string;
  lang?: string;
}

export default function EmergencyModal({
  isOpen,
  onGetHelp,
  onAcknowledge,
  symptomReason,
}: EmergencyModalProps) {
  const primaryBtnRef = useRef<HTMLButtonElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [staffAlerted, setStaffAlerted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      primaryBtnRef.current?.focus();
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setStaffAlerted(false);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        if (!modalRef.current) return;
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStaffAlert = () => {
    setStaffAlerted(true);
    onGetHelp();
  };

  return (
    <div
      className="emergency-modal-backdrop"
      role="presentation"
      aria-hidden="false"
    >
      <div
        ref={modalRef}
        className="emergency-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="emergency-modal-title"
        aria-describedby="emergency-modal-desc"
      >
        <div className="emergency-icon-banner" aria-hidden="true">
          <span className="emergency-warning-icon">⚠️</span>
        </div>

        <div className="emergency-content">
          <h1 id="emergency-modal-title" className="emergency-title">
            Please get help now
          </h1>

          <p id="emergency-modal-desc" className="emergency-desc">
            Your answers may indicate that you need immediate medical attention.
          </p>

          {symptomReason && (
            <div className="emergency-symptom-tag" role="note">
              <strong>Detected:</strong> {symptomReason}
            </div>
          )}

          <p className="emergency-support-text">
            Please alert hospital staff immediately.
          </p>

          {staffAlerted && (
            <div className="emergency-alerted-banner" role="status">
              ✓ Staff alerted. A clinical team member has been notified of your location at this kiosk.
            </div>
          )}

          <div className="emergency-actions">
            <button
              ref={primaryBtnRef}
              type="button"
              className="emergency-primary-cta"
              onClick={handleStaffAlert}
              aria-label="Get help from hospital staff immediately"
            >
              🚨 GET HELP FROM STAFF
            </button>

            <button
              type="button"
              className="emergency-secondary-cta"
              onClick={onAcknowledge}
              aria-label="I am already with hospital staff, continue visit"
            >
              I am already with hospital staff
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
