import { NextResponse } from "next/server";
import { databaseConfigured, withKioskTx } from "@/lib/db/pool";
import { getCookieBoundCase } from "@/lib/db/session-scope";
import { detectSafetySignals } from "@/lib/safety-signals";
import { writeAudit } from "@/lib/db/audit";
export const runtime="nodejs";

export async function POST(){
  if(!databaseConfigured()) return NextResponse.json({error:"Session storage is not configured",code:"DB_NOT_CONFIGURED"},{status:503});
  const cookieCase=await getCookieBoundCase();
  if(!cookieCase) return NextResponse.json({error:"No session"},{status:404});
  if(cookieCase.consentStatus!=="ACCEPTED") return NextResponse.json({error:"Consent is required"},{status:403});
  try{
    const result=await withKioskTx(cookieCase.id,async c=>{
      const locked=await c.query(`SELECT id,case_id,status,case_status,workflow_step,summary,completed_at,complaint_text,interview_data FROM patient_sessions WHERE id=$1 FOR UPDATE`,[cookieCase.id]);
      const s=locked.rows[0]; if(!s) throw new Error("NOT_FOUND");
      if(["AWAITING_REVIEW","URGENT_REVIEW","IN_CONSULTATION","COMPLETED"].includes(s.case_status)) return {caseId:s.case_id,caseStatus:s.case_status,summary:s.summary??null,idempotent:true};
      if(s.status!=="ACTIVE") throw new Error("NOT_ACTIVE");
      const processing=await c.query(`SELECT COUNT(*)::int AS n FROM documents WHERE session_id=$1 AND (ocr_status IN('PENDING','PROCESSING') OR extraction_status='PROCESSING')`,[s.id]);
      if(Number(processing.rows[0]?.n)>0) throw new Error("DOCUMENTS_PROCESSING");
      const complaints=await c.query(`SELECT id,position,complaint_text,body_region,severity FROM complaints WHERE session_id=$1 AND status='ACTIVE' ORDER BY position`,[s.id]);
      const evidence=await c.query(`SELECT id,category,normalized_value,original_wording,page_number,extraction_method,confidence,verification_state,uncertainty_notes FROM clinical_evidence WHERE session_id=$1 ORDER BY created_at`,[s.id]);
      const docs=await c.query(`SELECT id,original_filename,mime_type,ocr_status,extraction_status,verification_status FROM documents WHERE session_id=$1 ORDER BY received_at`,[s.id]);
      const patientTexts=[...complaints.rows.map((r:any)=>String(r.complaint_text)),...Object.values((s.interview_data??{}) as Record<string,any>).map((v:any)=>String(v?.value??""))];
      const drafts=detectSafetySignals(patientTexts);
      const existing=await c.query(`SELECT signal_type FROM safety_signals WHERE session_id=$1`,[s.id]); const seen=new Set(existing.rows.map((r:any)=>r.signal_type));
      for(const d of drafts) if(!seen.has(d.type)) await c.query(`INSERT INTO safety_signals(session_id,signal_type,summary,reason,source) VALUES($1,$2,$3,$4,$5)`,[s.id,d.type,d.summary,d.reason,d.source]);
      const signalRows=await c.query(`SELECT signal_type,summary,reason,status,source FROM safety_signals WHERE session_id=$1 ORDER BY created_at`,[s.id]);
      const urgent=signalRows.rows.some((r:any)=>r.status==="UNREVIEWED");
      const summary={version:"1.0",generatedBy:"deterministic-medikiosk",chiefComplaint:complaints.rows[0]?.complaint_text??s.complaint_text??null,complaints:complaints.rows.map((r:any)=>({position:r.position,text:r.complaint_text,region:r.body_region,severity:r.severity})),interview:s.interview_data??{},documents:docs.rows.map((r:any)=>({id:r.id,name:r.original_filename,ocrStatus:r.ocr_status,extractionStatus:r.extraction_status,verificationStatus:r.verification_status})),evidence:evidence.rows.map((r:any)=>({id:r.id,category:r.category,value:r.normalized_value,wording:r.original_wording,page:r.page_number,method:r.extraction_method,confidence:r.confidence,verificationState:r.verification_state,uncertainty:r.uncertainty_notes})),safetySignals:signalRows.rows};
      const status=urgent?"URGENT_REVIEW":"AWAITING_REVIEW";
      await c.query(`UPDATE patient_sessions SET case_status=$2,workflow_step='complete',summary=$3,completed_at=COALESCE(completed_at,now()),resume_token_hash=NULL WHERE id=$1`,[s.id,status,JSON.stringify(summary)]);
      await writeAudit(c,{type:"PATIENT",id:s.id},`case.${status.toLowerCase()}`,{type:"case",id:s.case_id},{signals:signalRows.rows.length});
      return {caseId:s.case_id,caseStatus:status,summary,idempotent:false};
    });
    return NextResponse.json(result,{headers:{"Cache-Control":"no-store, private"}});
  }catch(e){const m=e instanceof Error?e.message:"";if(m==="DOCUMENTS_PROCESSING")return NextResponse.json({error:"Document processing is still in progress",code:m},{status:409});if(m==="NOT_ACTIVE")return NextResponse.json({error:"Session is not active"},{status:410});return NextResponse.json({error:"Unable to complete intake"},{status:500});}
}
