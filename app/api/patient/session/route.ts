import { NextResponse } from "next/server";
import { createSession, PatientSessionRecordSchema } from "@/lib/session";
import { PatientLanguage } from "@/lib/patient-flow";

export async function POST(request: Request) {
  let language = "en";

  try {
    const body = await request.json();
    if (typeof body.language === "string") language = body.language;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsedLanguage = PatientLanguage.safeParse(language);
  if (!parsedLanguage.success) {
    return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
  }

  const session = createSession(parsedLanguage.data);
  PatientSessionRecordSchema.parse(session);
  const response = NextResponse.json({ sessionId: session.id, expiresAt: session.expiresAt }, { status: 201 });
  response.cookies.set("medikiosk_session", session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 60,
  });
  return response;
}
