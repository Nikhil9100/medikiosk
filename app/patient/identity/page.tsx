"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { validAbhaAddress, validAbhaNumber } from "@/lib/patient-identity";
import { usePatient } from "../PatientShell";

export default function Identity() {
  const router = useRouter();
  const { mutate, sync, ensureSynced, connection, t } = usePatient();
  const [hasAbhaMode, setHasAbhaMode] = useState<boolean | null>(null);
  const [number, setNumber] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(skip = false) {
    if (busy) return;
    setBusy(true);
    setError("");

    if (!skip && number && !validAbhaNumber(number)) {
      setError(t("abhaInvalidNumber") || "Enter a valid 14-digit ABHA number or leave it blank.");
      setBusy(false);
      return;
    }

    if (!skip && address && !validAbhaAddress(address)) {
      setError(
        t("abhaInvalidAddress") || "Enter a valid ABHA address ending in @abdm or leave it blank."
      );
      setBusy(false);
      return;
    }

    if (!skip && connection === "offline") {
      setError(
        "For privacy, full ABHA values are never cached offline. Reconnect to save them, or continue without ABHA."
      );
      setBusy(false);
      return;
    }

    let ok = false;
    if (!skip && !(await ensureSynced())) {
      setError(
        "Reconnect before saving ABHA. Full ABHA values are never cached offline."
      );
      setBusy(false);
      return;
    }

    if (skip) {
      const res = await mutate("/api/patient/identity", "POST", { skip: true });
      ok = res.ok;
    } else {
      try {
        const res = await fetch("/api/patient/identity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            abhaNumber: number || undefined,
            abhaAddress: address || undefined,
          }),
        });
        ok = res.ok;
      } catch {
        ok = false;
      }
    }

    if (!ok) {
      setError(
        skip
          ? t("saveFailedRetry") || "Could not save the skip choice. Please retry."
          : "Identity details could not be saved safely. Your full ABHA value was not cached."
      );
      setBusy(false);
      return;
    }

    if (await sync({ workflowStep: "complaint" })) {
      setNumber("");
      setAddress("");
      router.push("/patient/complaint");
      return;
    }
    setBusy(false);
  }

  return (
    <section className="flow-card reference-card identity-reference-card">
      <div className="centered-reference-heading">
        <div className="reference-icon-badge id-card" aria-hidden="true">
          ▣
        </div>
        <p className="eyebrow">{t("identityEyebrow") || "3 · ABHA (Optional)"}</p>
        <h1>
          Do you have an ABHA ID?{" "}
          <span className="soft-title">ABHA (Optional)</span>
        </h1>
        <p className="lead">
          ABHA can help connect your health information to your existing hospital records. If you don&apos;t have one or prefer not to use it, you can simply skip this step.
        </p>
      </div>

      {hasAbhaMode === null && (
        <div className="abha-choice-trio">
          <button
            type="button"
            className="abha-choice-card"
            onClick={() => setHasAbhaMode(true)}
          >
            <span className="choice-icon">🪪</span>
            <strong>I HAVE ABHA</strong>
            <small>I have a 14-digit number or ABHA address</small>
          </button>

          <button
            type="button"
            className="abha-choice-card"
            onClick={() => void submit(true)}
          >
            <span className="choice-icon">✕</span>
            <strong>I DON&apos;T HAVE ABHA</strong>
            <small>No problem, we&apos;ll proceed directly to your visit</small>
          </button>


          <button
            type="button"
            className="abha-choice-card skip-card"
            onClick={() => void submit(true)}
          >
            <span className="choice-icon">→</span>
            <strong>Continue without ABHA</strong>
            <small>You can link your records later with hospital staff</small>
          </button>
        </div>
      )}

      {hasAbhaMode === true && (
        <>
          <div className="abha-info-card">
            <strong>{t("abhaCardTitle") || "What happens to this identifier?"}</strong>
            <span>
              {t("abhaCardDesc") ||
                "Only a privacy-minimised hint is retained for self-declared ABHA. Full numbers are never cached in offline drafts."}
            </span>
          </div>

          <div className="form-grid reference-form">
            <div className="field">
              <label htmlFor="abha-number">{t("abhaNumberLabel") || "14-digit ABHA Number"}</label>
              <input
                id="abha-number"
                inputMode="numeric"
                maxLength={17}
                placeholder={t("abhaNumberPlaceholder") || "e.g. 14-1234-5678-9012"}
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="abha-address">{t("abhaAddressLabel") || "ABHA Address (@abdm)"}</label>
              <input
                id="abha-address"
                autoCapitalize="none"
                placeholder={t("abhaAddressPlaceholder") || "e.g. yourname@abdm"}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>

          <div className="privacy-inline">
            🔒 Full ABHA values are never cached in offline recovery storage.
          </div>

          <div className="reference-actions stacked-mobile">
            <button
              className="primary reference-primary"
              disabled={busy}
              onClick={() => void submit(false)}
            >
              {busy ? t("processing") : "Save & Continue →"}
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void submit(true)}
            >
              Continue without ABHA
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="system-banner error" role="alert">
          {error}
        </div>
      )}

      {hasAbhaMode === null && (
        <div className="privacy-inline" style={{ textAlign: "center", marginTop: "24px" }}>
          🔒 Full ABHA values are never cached offline. Your care is identical whether you link ABHA or not.
        </div>
      )}
    </section>
  );
}
