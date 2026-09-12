import { NextResponse } from "next/server";
import { getStaff } from "./staff-auth";
export async function requireStaff(role?:"DOCTOR"|"HOSPITAL"){
  const staff=await getStaff();
  if(!staff) return {staff:null,response:NextResponse.json({error:"Authentication required"},{status:401})};
  if(role && staff.role!==role) return {staff:null,response:NextResponse.json({error:"Forbidden"},{status:403})};
  return {staff,response:null};
}
