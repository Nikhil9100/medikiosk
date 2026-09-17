import "server-only";
import { cookies } from "next/headers";
import { databaseConfigured, withKioskTx } from "./pool";
import { getCase } from "./cases";
export const SESSION_COOKIE="medikiosk_session";
export async function sessionIdFromCookie(){return (await cookies()).get(SESSION_COOKIE)?.value??null;}
export async function getCookieBoundCase(){if(!databaseConfigured())return null;const id=await sessionIdFromCookie();if(!id)return null;try{return await withKioskTx(id,c=>getCase(c,id));}catch{return null;}}
export async function getActiveKioskSession(){const s=await getCookieBoundCase();if(!s||s.status!=="ACTIVE"||s.expiresAt.getTime()<=Date.now())return null;return s;}
export function patientWritable(s:{caseStatus:string}){return ["NEW","IN_PROGRESS"].includes(s.caseStatus);}
