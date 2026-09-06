import { NextResponse } from "next/server";
import { mapApplicationLanguageToSarvam, SarvamLanguageCode, transcribeWithSarvam } from "@/lib/sarvam";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");
    const language = formData.get("language");

    if (!audio || !(audio instanceof File)) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    if (typeof language !== "string" || !language) {
      return NextResponse.json({ error: "Language is required" }, { status: 400 });
    }

    let sarvamLanguage: SarvamLanguageCode;
    try {
      sarvamLanguage = mapApplicationLanguageToSarvam(language);
    } catch {
      return NextResponse.json({ error: `Unsupported language: ${language}` }, { status: 400 });
    }

    const maxBytes = 30 * 1024 * 1024;
    if (audio.size > maxBytes) {
      return NextResponse.json({ error: "Audio file is too large" }, { status: 400 });
    }

    const audioBuffer = await audio.arrayBuffer();
    const transcript = await transcribeWithSarvam(audioBuffer, sarvamLanguage);

    return NextResponse.json({ transcript, language: sarvamLanguage });
  } catch (error) {
    console.error("Voice transcription failed:", error);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}
