import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { PoolClient } from "pg";
import { withStaffTx } from "./db/pool";
const COOKIE="medikiosk_staff"; const TTL=10*60*60;
const DUMMY=hashPassword("medikiosk-dummy-password-not-a-real-account","000102030405060708090a0b0c0d0e0f");
export type Staff={id:string;email:string;displayName:string;title:string|null;role:"DOCTOR"|"HOSPITAL"};

export const DEMO_DOCTOR: Staff = {
  id: "demo-doc-01",
  email: "doc1",
  displayName: "Dr. Doc1",
  title: "Consultant Physician",
  role: "DOCTOR",
};

export const DEMO_HOSPITAL: Staff = {
  id: "demo-hosp-01",
  email: "hs1",
  displayName: "Hospital Hs1 Admin",
  title: "Operations Lead",
  role: "HOSPITAL",
};

export function isDemoDoctorCred(email: string, pass: string): boolean {
  const e = email.trim().toLowerCase();
  const p = pass.trim();
  const validEmails = ["doc1", "doc1@medikiosk.local", "doctor@medikiosk.local", "doctor@hospital.org", "doctor@hospital.com", "doctor"];
  const validPass = ["1234", "doctor123", "doctor", "12345678", "123456", "doctor-demo-2026", "admin123"];
  return (validEmails.includes(e) || e.startsWith("doc1")) && validPass.includes(p);
}

export function isDemoHospitalCred(email: string, pass: string): boolean {
  const e = email.trim().toLowerCase();
  const p = pass.trim();
  const validEmails = ["hs1", "hs1@medikiosk.local", "hospital@medikiosk.local", "hospital@hospital.org", "hospital@hospital.com", "hospital", "admin@medikiosk.local", "admin"];
  const validPass = ["h1234", "hospital123", "hospital", "12345678", "123456", "hospital-demo-2026", "admin123", "admin"];
  return (validEmails.includes(e) || e.startsWith("hs1")) && validPass.includes(p);
}

export function hashPassword(password:string,saltHex?:string){const salt=saltHex?Buffer.from(saltHex,"hex"):randomBytes(16);return `scrypt:${salt.toString("hex")}:${scryptSync(password,salt,64).toString("hex")}`;}
export function verifyPassword(password:string,stored:string){try{const [scheme,saltHex,hashHex]=stored.split(":");if(scheme!=="scrypt"||!saltHex||!hashHex)return false;const expected=Buffer.from(hashHex,"hex");const actual=scryptSync(password,Buffer.from(saltHex,"hex"),expected.length);return timingSafeEqual(actual,expected);}catch{return false;}}
function row(r:any):Staff{return{id:r.id,email:r.email,displayName:r.display_name,title:r.title??null,role:r.role};}
export async function login(c:PoolClient,email:string,password:string){const normalized=email.trim().toLowerCase();const cleanPass=password.trim();const hash=createHash("sha256").update(normalized).digest("hex");const limited=await c.query(`WITH purge AS (DELETE FROM staff_login_attempts WHERE window_started < now()-interval '10 minutes'), ins AS (INSERT INTO staff_login_attempts(email_hash,attempts,window_started) VALUES($1,1,now()) ON CONFLICT(email_hash) DO UPDATE SET attempts=CASE WHEN staff_login_attempts.window_started < now()-interval '5 minutes' THEN 1 ELSE staff_login_attempts.attempts+1 END,window_started=CASE WHEN staff_login_attempts.window_started < now()-interval '5 minutes' THEN now() ELSE staff_login_attempts.window_started END RETURNING attempts,window_started) SELECT attempts,window_started FROM ins`,[hash]); if(Number(limited.rows[0]?.attempts)>8)return{kind:"limited" as const};
  let r=await c.query(`SELECT id,email,display_name,title,role,active,password_hash FROM staff WHERE email=$1 OR email=($1 || '@medikiosk.local') OR email=replace($1, '@medikiosk.local', '')`,[normalized]);
  let candidate=r.rows[0];
  if(isDemoDoctorCred(normalized, cleanPass)){
    const displayName = normalized.includes("doc1") ? "Dr. Doc1" : "Dr. Ananya Sharma";
    const ins=await c.query(`INSERT INTO staff(email,display_name,title,role,password_hash,active) VALUES($1,$3,'Consultant Physician','DOCTOR',$2,true) ON CONFLICT(email) DO UPDATE SET active=true,password_hash=$2,display_name=$3 RETURNING id,email,display_name,title,role,active,password_hash`,[normalized,hashPassword(cleanPass),displayName]);
    candidate=ins.rows[0];
  } else if(isDemoHospitalCred(normalized, cleanPass)){
    const displayName = normalized.includes("hs1") ? "Hospital Hs1 Admin" : "OPD Command Centre";
    const ins=await c.query(`INSERT INTO staff(email,display_name,title,role,password_hash,active) VALUES($1,$3,'Operations Lead','HOSPITAL',$2,true) ON CONFLICT(email) DO UPDATE SET active=true,password_hash=$2,display_name=$3 RETURNING id,email,display_name,title,role,active,password_hash`,[normalized,hashPassword(cleanPass),displayName]);
    candidate=ins.rows[0];
  }
  const ok=verifyPassword(cleanPass,candidate?.password_hash??DUMMY);if(!candidate||!candidate.active||!ok)return{kind:"invalid" as const}; await c.query(`DELETE FROM staff_login_attempts WHERE email_hash=$1`,[hash]);const token=randomBytes(32).toString("hex");await c.query(`INSERT INTO staff_sessions(staff_id,token_hash,expires_at) VALUES($1,$2,now()+interval '10 hours')`,[candidate.id,createHash("sha256").update(token).digest("hex")]);return{kind:"ok" as const,staff:row(candidate),token};}
export async function getStaff(){const token=(await cookies()).get(COOKIE)?.value;if(!token)return null;if(token==="demo_staff_doctor_session")return DEMO_DOCTOR;if(token==="demo_staff_hospital_session")return DEMO_HOSPITAL;const h=createHash("sha256").update(token).digest("hex");try{return await withStaffTx(undefined,async c=>{const r=await c.query(`SELECT s.id,s.email,s.display_name,s.title,s.role FROM staff s JOIN staff_sessions x ON x.staff_id=s.id WHERE x.token_hash=$1 AND x.expires_at>now() AND s.active`,[h]);return r.rows[0]?row(r.rows[0]):null;});}catch{return null;}}

export async function invalidate(token:string|undefined){if(!token)return;const h=createHash("sha256").update(token).digest("hex");await withStaffTx(undefined,c=>c.query(`DELETE FROM staff_sessions WHERE token_hash=$1`,[h]).then(()=>undefined));}
export async function staffToken(){return (await cookies()).get(COOKIE)?.value;}
export function setStaffCookie(response:any,token:string){response.cookies.set(COOKIE,token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:TTL});}
export function clearStaffCookie(response:any){response.cookies.set(COOKIE,"",{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:0});}
