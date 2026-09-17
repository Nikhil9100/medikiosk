import type { PoolClient } from "pg";
import { writeAudit } from "./audit";

export type CaseRecord={
  id:string;caseId:string;status:string;caseStatus:string;language:string;consentStatus:string;workflowStep:string;
  complaintText:string|null;bodyRegion:string|null;bodySubregion:string|null;interviewData:Record<string,unknown>|null;
  summary:Record<string,unknown>|null;createdAt:Date;updatedAt:Date;expiresAt:Date;resumeExpiresAt:Date;completedAt:Date|null;
};

const cols=`id,case_id,status,case_status,language,consent_status,workflow_step,complaint_text,body_region,body_subregion,interview_data,summary,created_at,updated_at,expires_at,resume_expires_at,completed_at`;
function map(r:any):CaseRecord{return{id:r.id,caseId:r.case_id,status:r.status,caseStatus:r.case_status,language:r.language,consentStatus:r.consent_status,workflowStep:r.workflow_step,complaintText:r.complaint_text,bodyRegion:r.body_region,bodySubregion:r.body_subregion,interviewData:r.interview_data,summary:r.summary,createdAt:r.created_at,updatedAt:r.updated_at,expiresAt:r.expires_at,resumeExpiresAt:r.resume_expires_at,completedAt:r.completed_at};}

export async function getCase(c:PoolClient,id:string){const r=await c.query(`SELECT ${cols} FROM patient_sessions WHERE id=$1`,[id]);return r.rows[0]?map(r.rows[0]):null;}

export async function createCase(c:PoolClient,input:{ownerId:string;idempotencyKey:string;language:string;resumeTokenHash?:string|null}){
  const prior=await c.query(`SELECT ${cols},resume_token_hash FROM find_session_by_idempotency($1)`,[input.idempotencyKey]);
  if(prior.rows[0]){const existingHash=prior.rows[0].resume_token_hash??null;const suppliedHash=input.resumeTokenHash??null;if(existingHash!==suppliedHash)throw new Error('IDEMPOTENCY_RESUME_MISMATCH');return map(prior.rows[0]);}
  const r=await c.query(`INSERT INTO patient_sessions(case_no,owner_id,idempotency_key,language,workflow_step,resume_token_hash,resume_expires_at,last_patient_activity_at) VALUES(nextval('medikiosk_case_no_seq'),$1,$2,$3,'language',$4,now()+interval '8 hours',now()) RETURNING ${cols}`,[input.ownerId,input.idempotencyKey,input.language,input.resumeTokenHash??null]);
  return map(r.rows[0]);
}

export async function touchPatientSession(c:PoolClient,id:string){
  await c.query(`UPDATE patient_sessions SET expires_at=now()+interval '30 minutes',resume_expires_at=now()+interval '8 hours',last_patient_activity_at=now() WHERE id=$1 AND status='ACTIVE'`,[id]);
}

export async function patchCase(c:PoolClient,id:string,patch:{language?:string;consentStatus?:string;workflowStep?:string;complaintText?:string|null;bodyRegion?:string|null;bodySubregion?:string|null;interviewData?:Record<string,unknown>}){
  const current=await getCase(c,id); if(!current||current.status!=="ACTIVE") return null; if(!["NEW","IN_PROGRESS"].includes(current.caseStatus)) throw new Error("CASE_READ_ONLY");
  const r=await c.query(`UPDATE patient_sessions SET language=COALESCE($2,language),consent_status=COALESCE($3,consent_status),consent_timestamp=CASE WHEN $3='ACCEPTED' THEN COALESCE(consent_timestamp,now()) ELSE consent_timestamp END,consent_version=CASE WHEN $3='ACCEPTED' THEN COALESCE(consent_version,'2026-09') ELSE consent_version END,workflow_step=COALESCE($4,workflow_step),complaint_text=CASE WHEN $5::boolean THEN $6 ELSE complaint_text END,body_region=CASE WHEN $7::boolean THEN $8 ELSE body_region END,body_subregion=CASE WHEN $9::boolean THEN $10 ELSE body_subregion END,interview_data=CASE WHEN $11::boolean THEN COALESCE(interview_data,'{}'::jsonb)||$12::jsonb ELSE interview_data END,case_status=CASE WHEN case_status='NEW' AND ($6 IS NOT NULL OR $12::jsonb<>'{}'::jsonb) THEN 'IN_PROGRESS' ELSE case_status END,expires_at=now()+interval '30 minutes',resume_expires_at=now()+interval '8 hours',last_patient_activity_at=now() WHERE id=$1 RETURNING ${cols}`,[id,patch.language??null,patch.consentStatus??null,patch.workflowStep??null,"complaintText" in patch,patch.complaintText??null,"bodyRegion" in patch,patch.bodyRegion??null,"bodySubregion" in patch,patch.bodySubregion??null,"interviewData" in patch,JSON.stringify(patch.interviewData??{})]);
  return r.rows[0]?map(r.rows[0]):null;
}

export async function closeLifecycle(c:PoolClient,id:string){await c.query(`UPDATE patient_sessions SET status='COMPLETED',completed_at=COALESCE(completed_at,now()),resume_token_hash=NULL WHERE id=$1 AND status='ACTIVE'`,[id]);await writeAudit(c,{type:"PATIENT",id},"session.completed",{type:"case",id});}
