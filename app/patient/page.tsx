"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { languageNames } from "@/lib/i18n";
import type { PatientLanguage } from "@/lib/patient-flow";
import { usePatient } from "./PatientShell";

const languageMeta: Record<PatientLanguage,{native:string;secondary:string}> = {
  en:{native:"English",secondary:"English"}, hi:{native:"हिंदी",secondary:"Hindi"},
  bn:{native:"বাংলা",secondary:"Bengali"}, te:{native:"తెలుగు",secondary:"Telugu"},
  ta:{native:"தமிழ்",secondary:"Tamil"}, mr:{native:"मराठी",secondary:"Marathi"},
};

export default function PatientWelcome(){
  const router=useRouter();
  const {workflow,t,beginSession,sync,setLanguage}=usePatient();
  const [selected,setSelected]=useState<PatientLanguage>(workflow.language);
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function begin(){
    if(busy)return;setBusy(true);setError("");
    const ok=await beginSession();
    if(!ok){setError("A secure patient session could not be started. Reconnect and retry; no duplicate case will be created.");setBusy(false);return;}
    setLanguage(selected);
    if(await sync({language:selected,workflowStep:"consent"})){router.push("/patient/consent");return;}
    setError("Your secure visit started, but the language choice could not be saved yet. Please retry.");setBusy(false);
  }
  return <section className="flow-card reference-card welcome-reference-card">
    <div className="welcome-reference-grid">
      <div>
        <div className="reference-icon-badge" aria-hidden="true">✚</div>
        <p className="eyebrow">Welcome to MediKiosk</p>
        <h1>{t("welcomeTitle")}</h1>
        <p className="lead">Holistic clinical intake through modern technology, patient-friendly guidance and physician review.</p>
        <div className="reference-trust-list" aria-label="MediKiosk benefits">
          <span>✓ Private & secure</span><span>✓ Voice or touch</span><span>✓ Saves progress safely</span><span>✓ Doctor remains in control</span>
        </div>
      </div>
      <div className="language-reference-panel">
        <div className="section-kicker">Choose your language</div>
        <div className="language-reference-list">
          {(Object.keys(languageNames) as PatientLanguage[]).map(key=>{
            const meta=languageMeta[key];return <button type="button" key={key} className="language-reference-option" aria-pressed={selected===key} onClick={()=>setSelected(key)}>
              <span className="language-reference-radio" aria-hidden="true">{selected===key?"●":"○"}</span>
              <span><strong>{meta.native}</strong><small>{meta.secondary}</small></span><span aria-hidden="true">›</span>
            </button>;
          })}
        </div>
      </div>
    </div>
    {error&&<div className="system-banner error" role="alert">{error}</div>}
    <div className="reference-actions"><button className="primary reference-primary" disabled={busy} onClick={()=>void begin()}>{busy?"Starting securely…":"Continue"} →</button></div>
    <div className="reference-bottom-cards"><span>♿ <b>Accessible for all</b></span><span>☝ <b>Simple & easy to use</b></span></div>
  </section>;
}
