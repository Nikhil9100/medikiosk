import { NextResponse } from "next/server";
import { z } from "zod";
import { initiateAbdmVerification } from "@/lib/abdm";

export const runtime = "nodejs";

const Body = z.object({
  identifier: z.string().min(3).max(64),
}).strict();

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid ABHA number or address." }, { status: 400 });
  }

  const result = await initiateAbdmVerification(parsed.data.identifier);
  if (!result.success) {
    return NextResponse.json({ error: result.error || "Unable to initiate ABHA verification." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    txnId: result.txnId,
    maskedMobile: result.maskedMobile,
    devOtp: result.devOtp,
    message: "ABDM OTP sent to the mobile number registered with your ABHA.",
  });
}
