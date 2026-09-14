import { NextResponse } from "next/server";
import { z } from "zod";
import { generatePhoneOtp, maskPhoneNumber } from "@/lib/auth/otp";

export const runtime = "nodejs";

const Body = z.object({
  phone: z.string().min(10).max(16),
}).strict();

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid mobile number format." }, { status: 400 });
  }

  const result = await generatePhoneOtp(parsed.data.phone);
  if (!result.success) {
    return NextResponse.json({ error: result.error, retryAfter: result.retryAfter }, { status: 429 });
  }

  return NextResponse.json({
    ok: true,
    maskedPhone: maskPhoneNumber(parsed.data.phone),
    devOtp: result.devOtp,
    message: "OTP sent successfully to your mobile number.",
  });
}
