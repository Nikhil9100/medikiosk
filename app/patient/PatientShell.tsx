"use client";
import Image from "next/image";
import { createContext,useCallback,useContext,useEffect,useMemo,useState } from "react";
import { usePathname,useRouter } from "next/navigation";
import { defaultWorkflow,routeForStep,type BodyRegion,type PatientLanguage,type PatientStep,type PatientWorkflow } from "@/lib/patient-flow";
import { t as translate,type TranslationKey,languageNames,localizedAssistantName } from "@/lib/i18n";
import { clearFormDraft,clearOfflineState,enqueueJsonMutation,getResumeCredentials,listPendingMutations,loadFormDraft,loadOfflineWorkflow,loadResumeCredentials,pendingMutationCount,replayQueuedMutations,saveFormDraft,saveOfflineWorkflow } from "@/lib/offline-resilience";
import PatientIcon from "@/components/patient/PatientIcon";

type ConnectionState="online"|"offline"|"syncing"|"attention";
type MutationResult={ok:boolean;queued:boolean;status:number;data?:any};
type Context={
 workflow:PatientWorkflow;setWorkflow:React.Dispatch<React.SetStateAction<PatientWorkflow>>;
 sync:(patch:Record<string,unknown>)=>Promise<boolean>;
 mutate:(path:string,method:"POST"|"PATCH"|"DELETE",body?:Record<string,unknown>,mutationId?:string)=>Promise<MutationResult>;
 ensureSynced:()=>Promise<boolean>;beginSession:()=>Promise<boolean>;finishOfflineCase:()=>Promise<void>;
 t:(key:TranslationKey)=>string;setLanguage:(l:PatientLanguage)=>void;reset:()=>Promise<boolean>;
 saveDraft:(key:string,value:unknown)=>Promise<void>;loadDraft:<T>(key:string)=>Promise<T|null>;clearDraft:(key:string)=>Promise<void>;
 connection:ConnectionState;pendingCount:number;queuedBodies:(path:string)=>Promise<Record<string,unknown>[]>;
 triggerEmergency:()=>void;
};
const Ctx=createContext<Context|null>(null);
const progress = [
  { key: "language", labelKey: "stepLanguage", fallback: "Language" },
  { key: "consent", labelKey: "stepConsent", fallback: "Consent" },
  { key: "identity", labelKey: "stepIdentity", fallback: "ABHA" },
  { key: "complaint", labelKey: "stepComplaint", fallback: "Concern" },
  { key: "anatomy", labelKey: "stepAnatomy", fallback: "Severity & area" },
  { key: "symptoms", labelKey: "stepSymptoms", fallback: "Symptoms" },
  { key: "interview", labelKey: "stepInterview", fallback: "Interview" },
  { key: "documents", labelKey: "stepDocuments", fallback: "Documents" },
  { key: "complete", labelKey: "stepComplete", fallback: "Complete" },
] as const;
export const usePatient=()=>{const v=useContext(Ctx);if(!v)throw new Error("Patient context missing");return v;};

function localPatch(w:PatientWorkflow,patch:Record<string,unknown>):PatientWorkflow{
 return {...w,
  ...(typeof patch.language==="string"?{language:patch.language as PatientLanguage}:{}),
  ...(typeof patch.consentStatus==="string"?{consentStatus:patch.consentStatus as PatientWorkflow["consentStatus"]}:{}),
  ...(typeof patch.workflowStep==="string"?{currentStep:patch.workflowStep as PatientStep}:{}),
  ...(Object.prototype.hasOwnProperty.call(patch,"complaintText")?{complaint:(patch.complaintText as string|null)??""}:{}),
  ...(Object.prototype.hasOwnProperty.call(patch,"bodyRegion")?{region:(patch.bodyRegion as BodyRegion|null)??null}:{}),
  ...(patch.interviewData&&typeof patch.interviewData==="object"?{interviewFacts:{...w.interviewFacts,...patch.interviewData as PatientWorkflow["interviewFacts"]}}:{})
 };
}

export default function PatientShell({children}:{children:React.ReactNode}){
 const [workflow,setWorkflow]=useState<PatientWorkflow>(defaultWorkflow);const [boot,setBoot]=useState(true);const [error,setError]=useState("");const [connection,setConnection]=useState<ConnectionState>("online");const [pendingCount,setPendingCount]=useState(0);const [emergencyModalOpen,setEmergencyModalOpen]=useState(false);const [staffAlerted,setStaffAlerted]=useState(false);const [offlineModalOpen,setOfflineModalOpen]=useState(false);const router=useRouter();const pathname=usePathname();
 const triggerEmergency=useCallback(()=>{setStaffAlerted(false);setEmergencyModalOpen(true);},[]);
 const anyModalOpen=emergencyModalOpen||offlineModalOpen;
 useEffect(()=>{
  if(typeof document==="undefined")return;
  document.body.classList.toggle("patient-modal-open",anyModalOpen);
  if(!anyModalOpen)return;
  const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape"){setEmergencyModalOpen(false);setOfflineModalOpen(false);}};
  document.addEventListener("keydown",onKey);
  return()=>{document.removeEventListener("keydown",onKey);document.body.classList.remove("patient-modal-open");};
 },[anyModalOpen]);
 const updatePending=useCallback(async()=>setPendingCount(await pendingMutationCount()),[]);
 const persistWorkflow=useCallback(async(w:PatientWorkflow)=>{if(!w.sessionId)return;if(w.currentStep==="complete"){await clearOfflineState();return;}await saveOfflineWorkflow(w);},[]);
 const setAndPersist=useCallback((next:PatientWorkflow)=>{setWorkflow(next);void persistWorkflow(next);},[persistWorkflow]);

 const resumeSavedSession=useCallback(async()=>{
  const creds=await loadResumeCredentials();if(!creds)return false;
  try{const res=await fetch("/api/patient/session/resume",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({resumeSecret:creds.resumeSecret}),cache:"no-store"});if(!res.ok)return false;const data=await res.json();setAndPersist(data.workflow);setError("");return true;}catch{return false;}
 },[setAndPersist]);

 const flush=useCallback(async()=>{
  if(typeof navigator!=="undefined"&&!navigator.onLine){setConnection("offline");await updatePending();return false;}
  setConnection("syncing");
  let out=await replayQueuedMutations();
  if(out.sessionLost){const resumed=await resumeSavedSession();if(!resumed){setConnection("attention");setError("This saved visit could not be resumed automatically. Please ask hospital staff before starting another patient.");await updatePending();return false;}out=await replayQueuedMutations();}
  await updatePending();
  if(out.networkLost){setConnection("offline");setError("Connection lost. Your encrypted draft remains on this device and will sync when the network returns.");return false;}
  if(out.conflict||out.remaining>0){setConnection("attention");setError("Some saved changes need attention before submission. Please retry sync or ask hospital staff.");return false;}
  try{
    const res=await fetch("/api/patient/session",{cache:"no-store"});
    if(res.ok){const data=await res.json();setAndPersist(data.workflow);setConnection("online");setError("");return true;}
    if(res.status===404||res.status===410){
      const resumed=await resumeSavedSession();
      if(resumed){setConnection("online");setError("");return true;}
      const local=await loadOfflineWorkflow();
      const pending=await pendingMutationCount();
      if(local?.sessionId||pending>0){
        setConnection("attention");
        setError("The server session is no longer writable. Your encrypted local draft is preserved for staff-assisted recovery.");
        return false;
      }else{
        setConnection("online");
        setError("");
        return true;
      }
    }
  }
  catch{setConnection("offline");return false;}
  setConnection("attention");return false;
 },[resumeSavedSession,setAndPersist,updatePending]);

 const sync=useCallback(async(patch:Record<string,unknown>)=>{
  const id=`session-${crypto.randomUUID()}`;
  const queue=async()=>{try{await enqueueJsonMutation({id,path:"/api/patient/session",method:"PATCH",body:patch});setWorkflow(w=>{const next=localPatch(w,patch);void persistWorkflow(next);return next;});setConnection("offline");setError("Offline — this change is encrypted on this device and will sync automatically when the connection returns.");await updatePending();return true;}catch(e){setConnection("attention");setError(e instanceof Error&&e.message==="OFFLINE_QUEUE_FULL"?"Offline recovery is full. Reconnect and sync before continuing; no queued answer was discarded.":"Offline recovery storage is unavailable in this browser. Reconnect before continuing so no answer is lost.");return false;}};
  if(typeof navigator!=="undefined"&&!navigator.onLine)return queue();
  if(await pendingMutationCount()>0&&!await flush())return false;
  try{
   let res=await fetch("/api/patient/session",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(patch)});
   if(res.status===404||res.status===410){if(await resumeSavedSession())res=await fetch("/api/patient/session",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(patch)});}
   if(!res.ok){setError(res.status===409?"This case is already submitted and cannot be changed.":"We could not save this safely. Please retry.");return false;}
   const d=await res.json();setAndPersist(d.workflow);setConnection("online");setError("");return true;
  }catch{return queue();}
 },[flush,persistWorkflow,resumeSavedSession,setAndPersist,updatePending]);

 const mutate=useCallback(async(path:string,method:"POST"|"PATCH"|"DELETE",body?:Record<string,unknown>,mutationId=crypto.randomUUID()):Promise<MutationResult>=>{
  const safeBody=path==="/api/patient/complaints"&&method==="POST"?{...body,clientMutationId:mutationId}:body;
  const queue=async()=>{try{await enqueueJsonMutation({id:mutationId,path,method,body:safeBody});setConnection("offline");setError("Offline — your saved answers are encrypted on this device and will sync when the connection returns.");await updatePending();return{ok:true,queued:true,status:202};}catch(e){setConnection("attention");setError(e instanceof Error&&e.message==="OFFLINE_QUEUE_FULL"?"Offline recovery is full. Reconnect and sync before continuing; no queued answer was discarded.":"This change cannot be stored safely offline. Reconnect before continuing.");return{ok:false,queued:false,status:0};}};
  if(typeof navigator!=="undefined"&&!navigator.onLine)return queue();
  if(await pendingMutationCount()>0&&!await flush())return{ok:false,queued:false,status:409};
  try{
   let res=await fetch(path,{method,headers:{"content-type":"application/json"},body:safeBody===undefined?undefined:JSON.stringify(safeBody),cache:"no-store"});
   if(res.status===404||res.status===410){if(await resumeSavedSession())res=await fetch(path,{method,headers:{"content-type":"application/json"},body:safeBody===undefined?undefined:JSON.stringify(safeBody),cache:"no-store"});}
   const data=await res.json().catch(()=>undefined);return{ok:res.ok,queued:false,status:res.status,data};
  }catch{return queue();}
 },[flush,resumeSavedSession,updatePending]);

 const ensureSynced=useCallback(async()=>{await updatePending();if(typeof navigator!=="undefined"&&!navigator.onLine)return false;return flush();},[flush,updatePending]);

 const beginSession=useCallback(async()=>{
  setError("");
  try{
   const existing=await fetch("/api/patient/session",{cache:"no-store"});if(existing.ok){const d=await existing.json();setAndPersist(d.workflow);return true;}
  }catch{/* continue with idempotent create */}
  let creds:{createKey:string;resumeSecret:string|null};try{creds=await getResumeCredentials();}catch{creds={createKey:crypto.randomUUID(),resumeSecret:null};}
  try{const res=await fetch("/api/patient/session",{method:"POST",headers:{"Idempotency-Key":creds.createKey,"content-type":"application/json"},body:JSON.stringify(creds.resumeSecret?{resumeSecret:creds.resumeSecret}:{})});const d=await res.json().catch(()=>({}));if(!res.ok)throw new Error();setAndPersist(d.workflow);setConnection("online");return true;}catch{setConnection("offline");setError("A secure server session could not be started. Retry when connected; the same idempotent session key will be reused safely.");return false;}
 },[setAndPersist]);

 const bootstrap=useCallback(async()=>{
  const local=await loadOfflineWorkflow();const pending=await pendingMutationCount();setPendingCount(pending);if(local?.sessionId)setWorkflow(local);
  try{
   const r=await fetch("/api/patient/session",{cache:"no-store"});
   if(r.ok){const d=await r.json();if(pending===0)setAndPersist(d.workflow);else{setConnection("syncing");void flush();}const source=pending>0&&local?local:d.workflow;const expected=routeForStep[source.currentStep as keyof typeof routeForStep];if(expected&&pathname!==expected&&pathname!=="/patient/assistant")router.replace(expected);}
   else if(r.status===404||r.status===410){
     const resumed=await resumeSavedSession();
     if(resumed){void flush();}
     else if(local?.sessionId||pending>0){setConnection("attention");setError("A saved local visit exists, but secure server resume is unavailable. Do not start a second patient until staff resolves it.");}
     else{setWorkflow(defaultWorkflow);setConnection("online");setError("");}
   }
   else setError("Session service is unavailable. Your local encrypted draft, if any, is preserved.");
  }catch{
    if(local?.sessionId||pending>0){setConnection("offline");setError("Offline mode — your encrypted saved work is available on this device. Changes will sync automatically after reconnection.");const expected=local?.currentStep?routeForStep[local.currentStep]:undefined;if(expected&&pathname!==expected&&pathname!=="/patient/assistant")router.replace(expected);}
    else{setConnection(typeof navigator!=="undefined"&&!navigator.onLine?"offline":"online");if(typeof navigator!=="undefined"&&!navigator.onLine)setError("You are offline. Connect before starting a new secure patient session.");}
  }
  finally{setBoot(false);}
 },[flush,pathname,resumeSavedSession,router,setAndPersist]);

 useEffect(()=>{void bootstrap();},[bootstrap]);
 useEffect(()=>{
  const onOnline=()=>{void flush();};
  const onOffline=()=>{setConnection("offline");setOfflineModalOpen(true);};
  window.addEventListener("online",onOnline);
  window.addEventListener("offline",onOffline);
  return()=>{window.removeEventListener("online",onOnline);window.removeEventListener("offline",onOffline);};
 },[flush]);
 useEffect(()=>{if(workflow.sessionId)void persistWorkflow(workflow);},[persistWorkflow,workflow]);

 const setLanguage=(language:PatientLanguage)=>setWorkflow(w=>({...w,language}));
 const reset=useCallback(async()=>{if(typeof navigator!=="undefined"&&!navigator.onLine){setError("Reconnect before starting a new patient so the previous visit can be closed securely.");return false;}try{const r=await fetch("/api/patient/session/reset",{method:"POST"});if(!r.ok)throw new Error();await clearOfflineState();setWorkflow(defaultWorkflow);setPendingCount(0);setConnection("online");router.replace("/patient");return true;}catch{setError("The previous session could not be closed safely. Please retry before the next patient.");return false;}},[router]);
 const finishOfflineCase=useCallback(async()=>{await clearOfflineState();setPendingCount(0);},[]);
 const safeSaveDraft=useCallback(async(key:string,value:unknown)=>{try{await saveFormDraft(key,value);}catch{setError("Encrypted offline draft storage is unavailable. Reconnect before leaving this page if you have unsaved text.");}},[]);
 const queuedBodies=useCallback(async(path:string)=>(await listPendingMutations()).filter(m=>m.path===path&&m.body).map(m=>m.body as Record<string,unknown>),[]);
 const value=useMemo(()=>({workflow,setWorkflow,sync,mutate,ensureSynced,beginSession,finishOfflineCase,t:(k:TranslationKey)=>translate(workflow.language,k),setLanguage,reset,saveDraft:safeSaveDraft,loadDraft:loadFormDraft,clearDraft:clearFormDraft,connection,pendingCount,queuedBodies,triggerEmergency}),[workflow,sync,mutate,ensureSynced,beginSession,finishOfflineCase,safeSaveDraft,connection,pendingCount,queuedBodies,reset,triggerEmergency]);
 const current=pathname==="/patient"?0:progress.findIndex(x=>pathname.includes(`/patient/${x.key}`));
 return <Ctx.Provider value={value}>
   <a className="skip-link" href="#patient-main">Skip to main content</a>
   <div className="patient-app reference-patient-app">
    <header className="patient-topbar reference-patient-header">
      <div className="patient-brand"><span className="brand-mark" aria-hidden="true">✚</span><div><strong>MediKiosk</strong><span>{translate(workflow.language,"patientVisit")} · {translate(workflow.language,"tagline")}</span></div></div>
      <div className="patient-top-actions">
        <button type="button" className="emergency-trigger-btn" onClick={()=>setEmergencyModalOpen(true)} aria-label="Emergency Help"><span aria-hidden="true">⚠️</span><span>{translate(workflow.language,"emergencyTriggerBtn") || "Get Help"}</span></button>
        <button
          type="button"
          className={`connection-chip ${connection}`}
          role="status"
          onClick={()=>{if(connection!=="online")setOfflineModalOpen(true);}}
          aria-label="Connection Status"
          style={{background:"transparent",border:"none",padding:0,cursor:connection!=="online"?"pointer":"default"}}
        >
          <span className={`connection-chip ${connection}`}>{connection==="online"?translate(workflow.language,"connectionOnline"):connection==="syncing"?translate(workflow.language,"connectionSyncing"):connection==="offline"?`${translate(workflow.language,"connectionOffline")} · ${pendingCount}`:translate(workflow.language,"connectionAttention")}</span>
        </button>
        {pathname === "/patient" && (
          <button type="button" onClick={()=>router.push("/patient/login")} className="top-action" aria-label="Login with Phone or ABHA"><span>📱 Check-in</span></button>
        )}
        {!pathname.includes("/patient/assistant") && (
          <button type="button" onClick={()=>router.push("/patient/assistant")} className="top-action medi-launcher" aria-label={translate(workflow.language,"assistant")}><Image src="/anaya-avatar.png" alt="" width={28} height={28} style={{borderRadius:"50%",objectFit:"cover",flex:"none"}} /> <span>{localizedAssistantName(workflow.language)}</span></button>
        )}
        <label className="language-chip"><span className="sr-only">{translate(workflow.language,"languageTitle")}</span><select value={workflow.language} onChange={e=>{const l=e.target.value as PatientLanguage;setLanguage(l);void sync({language:l});}}>{Object.entries(languageNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      </div>
    </header>
    {current>=0&&<nav className="patient-progress reference-progress" aria-label="Clinical intake progress">{progress.map((p,i)=><span key={p.key} className={i<current?"done":i===current?"active":""}><b>{i+1}</b><em>{translate(workflow.language,p.labelKey)||p.fallback}</em></span>)}</nav>}
    {current>=0&&<div className="patient-progress-mobile" aria-label="Clinical intake progress"><div className="mobile-progress-row"><span className="mobile-progress-step">Step {current+1} of {progress.length}</span><span className="mobile-progress-title">{translate(workflow.language,progress[current]?.labelKey)||progress[current]?.fallback}</span></div><div className="mobile-progress-track" role="progressbar" aria-valuenow={current+1} aria-valuemin={1} aria-valuemax={progress.length}><div className="mobile-progress-fill" style={{width:`${Math.round(((current+1)/progress.length)*100)}%`}}/></div></div>}
    {error&&<div className="system-banner error shell-banner" role="alert">{error}{connection!=="online"&&workflow.sessionId&&<button type="button" className="inline-retry" onClick={()=>void flush()}>Retry sync</button>}</div>}
    <main id="patient-main" className="patient-main reference-patient-main">{boot?<div className="loading-card" role="status"><h1 className="sr-only">Patient Console Loading</h1>Loading secure session…</div>:children}</main>
    <footer className="patient-footer reference-patient-footer"><nav className="patient-footer-nav" aria-label="Footer navigation"><div className="footer-brand"><strong>MediKiosk</strong><span className="footer-brand-sep" aria-hidden="true">·</span><span>{translate(workflow.language,"patientVisit")}</span></div><div className="footer-links"><a href="/patient/consent">{translate(workflow.language,"footerPrivacy")}</a><a href="/patient/consent">{translate(workflow.language,"footerTerms")}</a><a href="/patient/assistant">{localizedAssistantName(workflow.language)} {translate(workflow.language,"footerHelp")}</a><a href="/patient/language">{translate(workflow.language,"footerLanguage")}</a></div></nav><div className="footer-disclaimer"><span>{translate(workflow.language,"nonDiagnosticDisclaimer") || "Not a diagnostic tool · Physician review required"}</span><span>{translate(workflow.language,"emergencyNotice")}</span></div></footer>
    {emergencyModalOpen&&<div className="emergency-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="emergency-modal-title"><div className="emergency-modal-card"><div className="emergency-badge-icon" aria-hidden="true"><PatientIcon name="alert" size={30}/></div><h2 id="emergency-modal-title">{translate(workflow.language,"emergencyModalTitle") || "Please get help now"}</h2><p>{translate(workflow.language,"emergencyModalDesc") || "If you are experiencing severe chest pain, trouble breathing, sudden weakness, or heavy bleeding, you need immediate medical attention."}</p><button type="button" className="emergency-staff-action" onClick={()=>setStaffAlerted(true)}>🚨 {translate(workflow.language,"emergencyGetHelpBtn") || "GET HELP FROM STAFF"}</button><button type="button" className="emergency-dismiss-action" onClick={()=>setEmergencyModalOpen(false)}>{translate(workflow.language,"emergencyDismissBtn") || "I am safe · Continue answering"}</button>{staffAlerted&&<p className="emergency-staff-confirm" role="status">{translate(workflow.language,"emergencyStaffAlerted") || "Hospital staff has been alerted. Please approach the nearest triage desk or nurse immediately."}</p>}</div></div>}
    {offlineModalOpen&&<div className="offline-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="offline-modal-title"><div className="offline-modal-card"><div className="offline-badge-icon" aria-hidden="true"><PatientIcon name="signal" size={28}/></div><h2 id="offline-modal-title">{translate(workflow.language,"offlineModalTitle") || "Internet connection lost"}</h2><p>{translate(workflow.language,"offlineModalDesc") || "Your progress is safe. All your answers are securely encrypted on this device. You can keep answering, and your data will automatically sync as soon as the connection returns."}</p><div className="offline-modal-actions"><button type="button" className="offline-retry-action" onClick={async()=>{const ok=await flush();if(ok)setOfflineModalOpen(false);}}><PatientIcon name="refresh" size={17}/> {translate(workflow.language,"offlineCheckConnection") || "Check connection now"}</button><button type="button" className="offline-continue-action" onClick={()=>setOfflineModalOpen(false)}>{translate(workflow.language,"offlineContinueAnswering") || "Continue answering offline"}</button></div></div></div>}
    {connection==="offline"&&!offlineModalOpen&&<div className="offline-floating-toast" role="status" onClick={()=>setOfflineModalOpen(true)} aria-label="Offline status details"><span><PatientIcon name="signal" size={17}/></span><span>{translate(workflow.language,"offlineBannerNotice") || "Offline mode · Encrypted draft saved on device"}</span><small style={{textDecoration:"underline",marginLeft:"4px"}}>Details</small></div>}
   </div>
 </Ctx.Provider>;
}
