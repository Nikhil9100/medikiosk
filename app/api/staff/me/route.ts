import { NextResponse } from "next/server";import { getStaff } from "@/lib/staff-auth";
export async function GET(){const staff=await getStaff();return staff?NextResponse.json({staff},{headers:{"Cache-Control":"no-store, private"}}):NextResponse.json({error:"Authentication required"},{status:401});}
