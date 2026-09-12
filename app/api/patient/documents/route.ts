import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getActiveKioskSession,patientWritable } from "@/lib/db/session-scope";
import { withKioskTx } from "@/lib/db/pool";
import { detectMime,MAX_FILE_SIZE } from "@/lib/documents";
import { touchPatientSession } from "@/lib/db/cases";
export const runtime="nodejs";
const selectFields=`id,original_filename AS "originalFilename",mime_type AS "mimeType",ocr_status AS "ocrStatus",extraction_status AS "extractionStatus",verification_status AS "verificationStatus",created_at AS "createdAt"`;
export async function GET(){const s=await getActiveKioskSession();if(!s)return NextResponse.json({error:"No active session"},{status:404});const docs=await withKioskTx(s.id,c=>c.query(`SELECT ${selectFields} FROM documents WHERE session_id=$1 ORDER BY created_at`,[s.id]).then(r=>r.rows));return NextResponse.json({documents:docs},{headers:{"Cache-Control":"no-store, private"}});}
export async function POST(request:Request){
 const s=await getActiveKioskSession();if(!s)return NextResponse.json({error:"No active session"},{status:404});if(s.consentStatus!=="ACCEPTED")return NextResponse.json({error:"Consent required"},{status:403});if(!patientWritable(s))return NextResponse.json({error:"Submitted case is read-only"},{status:409});
 const fd=await request.formData();const file=fd.get("file");if(!(file instanceof File))return NextResponse.json({error:"File is required"},{status:400});if(file.size===0||file.size>MAX_FILE_SIZE)return NextResponse.json({error:file.size===0?"File is empty":"Maximum file size is 20 MB"},{status:400});
 const raw=new Uint8Array(await file.arrayBuffer());const mime=detectMime(raw);if(!mime)return NextResponse.json({error:"Unsupported or mismatched file content"},{status:400});const name=(file.name||"document").replace(/[\r\n]/g," ").slice(0,180);const contentHash=createHash("sha256").update(raw).digest("hex");
 const result=await withKioskTx(s.id,async c=>{const existing=await c.query(`SELECT ${selectFields} FROM documents WHERE session_id=$1 AND content_sha256=$2 LIMIT 1`,[s.id,contentHash]);if(existing.rows[0]){await touchPatientSession(c,s.id);return{doc:existing.rows[0],idempotent:true};}const inserted=await c.query(`INSERT INTO documents(session_id,document_type,processing_status,original_filename,mime_type,file_size,content,content_sha256,provenance,ocr_status,extraction_status,verification_status) VALUES($1,'OTHER','READY_FOR_OCR',$2,$3,$4,$5,$6,'PATIENT','NOT_STARTED','NOT_STARTED','UNVERIFIED') ON CONFLICT (session_id,content_sha256) WHERE content_sha256 IS NOT NULL DO NOTHING RETURNING ${selectFields}`,[s.id,name,mime,file.size,Buffer.from(raw),contentHash]);if(inserted.rows[0]){await touchPatientSession(c,s.id);return{doc:inserted.rows[0],idempotent:false};}const raced=await c.query(`SELECT ${selectFields} FROM documents WHERE session_id=$1 AND content_sha256=$2 LIMIT 1`,[s.id,contentHash]);await touchPatientSession(c,s.id);return{doc:raced.rows[0],idempotent:true};});
 return NextResponse.json({...result.doc,idempotent:result.idempotent},{status:result.idempotent?200:201,headers:{"Cache-Control":"no-store, private"}});
}
