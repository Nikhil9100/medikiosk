import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { databaseConfigured,withKioskTx,withOwnerTx } from "@/lib/db/pool";
import { createCase,getCase,patchCase,touchPatientSession } from "@/lib/db/cases";
import { SESSION_COOKIE,sessionIdFromCookie } from "@/lib/db/session-scope";
export const runtime="nodejs";

const Patch=z.object({
  language:z.enum(["en","hi","bn","te","ta","mr"]).optional(),
  consentStatus:z.enum(["NOT_REVIEWED","ACCEPTED","DECLINED"]).optional(),
  workflowStep:z.enum(["welcome","language","consent","identity","start","complaint","anatomy","symptoms","interview","documents","complete"]).optional(),
  complaintText:z.string().max(4000).nullable().optional(),
  bodyRegion:z.enum(["head","chest","abdomen","back","arm","hand","leg","foot","skin","other"]).nullable().optional(),
  bodySubregion:z.string().max(80).nullable().optional(),
  interviewData:z.record(z.string(),z.unknown()).optional()
}).strict();
const Create=z.object({resumeSecret:z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/).optional()}).strict();

export function workflow(s:any){return{sessionId:s.id,caseId:s.caseId,language:s.language,consentStatus:s.consentStatus,currentStep:s.workflowStep,complaint:s.complaintText??"",region:s.bodyRegion??null,severity:null,interviewFacts:s.interviewData??{},documents:[]};}
function setCookie(res:NextResponse,id:string){res.cookies.set(SESSION_COOKIE,id,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:30*60});}
function hashResumeSecret(secret:string){return createHash("sha256").update(secret).digest("hex");}

export async function POST(request:Request){
  if(!databaseConfigured())return NextResponse.json({error:"Database not configured",code:"DB_NOT_CONFIGURED"},{status:503});
  const header=request.headers.get("Idempotency-Key");const key=header&&/^[A-Za-z0-9._:-]{8,200}$/.test(header)?header:randomUUID();
  const parsed=Create.safeParse(await request.json().catch(()=>({}))); if(!parsed.success)return NextResponse.json({error:"Invalid session bootstrap"},{status:400});
  const ownerId=randomUUID(); const resumeTokenHash=parsed.data.resumeSecret?hashResumeSecret(parsed.data.resumeSecret):null;
  try{const s=await withOwnerTx(ownerId,c=>createCase(c,{ownerId,idempotencyKey:key,language:"en",resumeTokenHash}));const res=NextResponse.json({workflow:workflow(s),resumeEnabled:Boolean(resumeTokenHash)},{status:201,headers:{"Cache-Control":"no-store, private"}});setCookie(res,s.id);return res;}catch(e){if(e instanceof Error&&e.message==="IDEMPOTENCY_RESUME_MISMATCH")return NextResponse.json({error:"Session retry credentials do not match",code:"IDEMPOTENCY_CONFLICT"},{status:409});return NextResponse.json({error:"Unable to create secure session"},{status:500});}
}

export async function GET(){
  if(!databaseConfigured())return NextResponse.json({error:"Database not configured",code:"DB_NOT_CONFIGURED"},{status:503});
  const id=await sessionIdFromCookie();if(!id)return NextResponse.json({error:"No session"},{status:404});
  try{const s=await withKioskTx(id,async c=>{const current=await getCase(c,id);if(current&&current.status==="ACTIVE"&&current.expiresAt.getTime()>Date.now())await touchPatientSession(c,id);return current;});if(!s)return NextResponse.json({error:"No session"},{status:404});if(s.status!=="ACTIVE"||s.expiresAt.getTime()<=Date.now())return NextResponse.json({error:"Session ended",code:"SESSION_EXPIRED"},{status:410});return NextResponse.json({workflow:workflow(s)},{headers:{"Cache-Control":"no-store, private"}});}catch{return NextResponse.json({error:"Session unavailable"},{status:500});}
}

export async function PATCH(request:Request){
  if(!databaseConfigured())return NextResponse.json({error:"Database not configured"},{status:503});const id=await sessionIdFromCookie();if(!id)return NextResponse.json({error:"No session"},{status:404});
  const parsed=Patch.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Invalid body"},{status:400});
  try{const s=await withKioskTx(id,c=>patchCase(c,id,parsed.data));if(!s)return NextResponse.json({error:"Session not writable"},{status:410});return NextResponse.json({workflow:workflow(s)},{headers:{"Cache-Control":"no-store, private"}});}catch(e){if((e as Error).message==="CASE_READ_ONLY")return NextResponse.json({error:"Submitted cases are read-only"},{status:409});return NextResponse.json({error:"Unable to save"},{status:500});}
}
