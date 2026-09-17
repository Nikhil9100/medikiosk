import { NextResponse } from "next/server";import { clearStaffCookie,invalidate,staffToken } from "@/lib/staff-auth";
export async function POST(){const token=await staffToken();await invalidate(token).catch(()=>{});const r=NextResponse.json({ok:true});clearStaffCookie(r);return r;}
