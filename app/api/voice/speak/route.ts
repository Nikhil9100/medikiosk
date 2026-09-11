import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveKioskSession } from "@/lib/db/session-scope";
import { mapApplicationLanguageToSarvam, SarvamLanguageCode, speakWithSarvam } from "@/lib/sarvam";

export const runtime = "nodejs";

const speakRequestSchema = z.object({
  text: z.string().min(1).max(2500),
  language: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    // Voice is a patient-session capability (kiosk assistant / interview);
    // unauthenticated requests must not reach the provider.
    const session = await getActiveKioskSession();
    if (!session) return NextResponse.json({ error: "No active session" }, { status: 404 });

    const body = await request.json();
    const parsed = speakRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    let sarvamLanguage: SarvamLanguageCode;
    try {
      sarvamLanguage = mapApplicationLanguageToSarvam(parsed.data.language);
    } catch {
      return NextResponse.json({ error: `Unsupported language: ${parsed.data.language}` }, { status: 400 });
    }

    const { audioBase64, contentType } = await speakWithSarvam(parsed.data.text, sarvamLanguage);

    return NextResponse.json({ audioBase64, contentType });
  } catch (error) {
    console.error("Speech synthesis failed:", error);
    return NextResponse.json({ error: "Speech synthesis failed" }, { status: 500 });
  }
}
