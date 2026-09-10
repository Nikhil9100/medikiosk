import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseConfigured, withStaffTx } from "@/lib/db/pool";
import { loginStaff, setStaffCookie } from "@/lib/staff-auth";

export const runtime = "nodejs";

const LoginSchema = z
  .object({
    email: z.string().email().max(200),
    password: z.string().min(8).max(200),
  })
  .strict();

// Simple in-memory rate limit (single instance, hackathon-grade): 8 attempts
// per email per 5 minutes. Documented in SECURITY.md.
const attempts = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 8;
const WINDOW_MS = 5 * 60 * 1000;

function rateLimited(email: string): boolean {
  const now = Date.now();
  const entry = attempts.get(email);
  if (!entry || now > entry.resetAt) {
    attempts.set(email, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > LIMIT;
}

export async function POST(request: Request) {
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Staff storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials format" }, { status: 400 });
  }
  const { email, password } = parsed.data;
  if (rateLimited(email)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let token: string | undefined;
  let member;
  try {
    member = await withStaffTx(async (client) => {
      const result = await loginStaff(client, email, password);
      token = (result as (typeof result & { token?: string }) | null)?.token;
      return result;
    });
  } catch (error) {
    console.error("Staff login failed:", error);
    return NextResponse.json({ error: "Unable to sign in" }, { status: 503 });
  }

  if (!member || !token) {
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  const response = NextResponse.json({
    staff: { id: member.id, email: member.email, displayName: member.displayName, title: member.title, role: member.role },
  });
  setStaffCookie(response, token);
  return response;
}
