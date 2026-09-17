import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseConfigured, withStaffTx } from "@/lib/db/pool";
import { DEMO_DOCTOR, DEMO_HOSPITAL, isDemoDoctorCred, isDemoHospitalCred, login, setStaffCookie } from "@/lib/staff-auth";

const Schema = z.object({
  email: z.string().min(3).max(254),
  password: z.string().min(4).max(200),
}).strict();

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter your email and password." }, { status: 400 });
  }

  const { email, password } = parsed.data;

  // 1. Check for easy demo doctor credentials
  if (isDemoDoctorCred(email, password)) {
    if (databaseConfigured()) {
      try {
        const result = await withStaffTx(undefined, (c) => login(c, email.trim().toLowerCase(), password));
        if (result.kind === "ok") {
          const response = NextResponse.json({ staff: result.staff });
          setStaffCookie(response, result.token);
          return response;
        }
      } catch (dbErr) {
        console.warn("Database unavailable during demo doctor login, using client session:", dbErr);
      }
    }
    const response = NextResponse.json({ staff: { ...DEMO_DOCTOR, email: email.trim() } });
    setStaffCookie(response, "demo_staff_doctor_session");
    return response;
  }

  // 2. Check for easy demo hospital credentials
  if (isDemoHospitalCred(email, password)) {
    if (databaseConfigured()) {
      try {
        const result = await withStaffTx(undefined, (c) => login(c, email.trim().toLowerCase(), password));
        if (result.kind === "ok") {
          const response = NextResponse.json({ staff: result.staff });
          setStaffCookie(response, result.token);
          return response;
        }
      } catch (dbErr) {
        console.warn("Database unavailable during demo hospital login, using client session:", dbErr);
      }
    }
    const response = NextResponse.json({ staff: { ...DEMO_HOSPITAL, email: email.trim() } });
    setStaffCookie(response, "demo_staff_hospital_session");
    return response;
  }

  // 3. For custom production staff accounts
  if (!databaseConfigured()) {
    return NextResponse.json(
      { error: "Database not configured. For evaluation, please use demo credentials: hospital@medikiosk.local / hospital123" },
      { status: 503 }
    );
  }

  try {
    const result = await withStaffTx(undefined, (c) => login(c, email, password));
    if (result.kind === "limited") {
      return NextResponse.json({ error: "Too many failed attempts. Try again in 5 minutes." }, { status: 429, headers: { "Retry-After": "300" } });
    }
    if (result.kind !== "ok") {
      return NextResponse.json({ error: "Invalid credentials. For quick demo, use hospital@medikiosk.local / hospital123" }, { status: 401 });
    }
    const response = NextResponse.json({ staff: result.staff });
    setStaffCookie(response, result.token);
    return response;
  } catch (err) {
    console.error("Staff login DB error:", err);
    return NextResponse.json({ error: "Database temporarily unreachable. Please use demo credentials." }, { status: 500 });
  }
}

