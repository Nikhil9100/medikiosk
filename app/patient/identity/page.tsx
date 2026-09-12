"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { validAbhaAddress, validAbhaNumber } from "@/lib/patient-identity";
import { usePatient } from "../PatientShell";

export default function Identity() {
  const router = useRouter();
  const { mutate, sync, ensureSynced, connection, t } = usePatient();
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
          {t("identityHeading")}{" "}
          <span className="soft-title">{t("identityOptional") || "(Optional)"}</span>
        </h1>
        <p className="lead">{t("identityLead")}</p>
      </div>

      <div className="abha-info-card">
        <strong>{t("abhaCardTitle")}</strong>
        <span>{t("abhaCardDesc")}</span>
      </div>

      <div className="form-grid reference-form">
        <div className="field">
          <label htmlFor="abha-number">{t("abhaNumberLabel")}</label>
          <input
            id="abha-number"
            inputMode="numeric"
            maxLength={17}
            placeholder={t("abhaNumberPlaceholder")}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="abha-address">{t("abhaAddressLabel")}</label>
          <input
            id="abha-address"
            autoCapitalize="none"
            placeholder={t("abhaAddressPlaceholder")}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
      </div>

      <div className="privacy-inline">
        🔒 {t("abhaOfflineNote") || "Full ABHA values are never cached in the offline recovery draft."}
      </div>

      {error && (
        <div className="system-banner error" role="alert">
          {error}
        </div>
      )}

      <div className="reference-actions stacked-mobile">
        <button
          className="primary reference-primary"
          disabled={busy}
          onClick={() => void submit(false)}
        >
          {busy ? t("processing") : `${t("continueWithAbha") || "Continue with ABHA"} →`}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void submit(true)}
        >
          {t("continueWithoutAbha") || "Continue without ABHA"}
        </button>
      </div>
    </section>
  );
}
