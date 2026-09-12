import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { databaseConfigured,withKioskTx,withOwnerTx } from "@/lib/db/pool";
import { getCase,touchPatientSession } from "@/lib/db/cases";
import { SESSION_COOKIE } from "@/lib/db/session-scope";
import { workflow } from "../route";
export const runtime="nodejs";
const Body=z.object({resumeSecret:z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/)}).strict();
function hash(secret:string){return createHash("sha256").update(secret).digest("hex");}
function setCookie(res:NextResponse,id:string){res.cookies.set(SESSION_COOKIE,id,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:30*60});}
export async function POST(request:Request){
 if(!databaseConfigured())return NextResponse.json({error:"Database not configured"},{status:503});
 const parsed=Body.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Invalid resume request"},{status:400});
 try{
  const tokenHash=hash(parsed.data.resumeSecret);
  const found=await withOwnerTx(randomUUID(),c=>c.query(`SELECT id FROM find_resumable_session($1)`,[tokenHash]).then(r=>r.rows[0]??null));
  if(!found)return NextResponse.json({error:"This saved visit can no longer be resumed",code:"RESUME_NOT_AVAILABLE"},{status:410});
  const s=await withKioskTx(found.id,async c=>{await touchPatientSession(c,found.id);return getCase(c,found.id)});
  if(!s||!["NEW","IN_PROGRESS"].includes(s.caseStatus))return NextResponse.json({error:"This visit is already submitted or closed",code:"RESUME_NOT_AVAILABLE"},{status:410});
  const res=NextResponse.json({workflow:workflow(s),resumed:true},{headers:{"Cache-Control":"no-store, private"}});setCookie(res,s.id);return res;
 }catch{return NextResponse.json({error:"Unable to resume this visit"},{status:500});}
}
