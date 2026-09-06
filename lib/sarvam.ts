import { z } from "zod";

export const SarvamLanguageCode = z.enum([
  "en-IN",
  "hi-IN",
  "bn-IN",
  "te-IN",
  "ta-IN",
  "mr-IN",
]);

export type SarvamLanguageCode = z.infer<typeof SarvamLanguageCode>;

const applicationToSarvamLanguage: Record<string, SarvamLanguageCode> = {
  en: "en-IN",
  hi: "hi-IN",
  bn: "bn-IN",
  te: "te-IN",
  ta: "ta-IN",
  mr: "mr-IN",
};

export function mapApplicationLanguageToSarvam(language: string): SarvamLanguageCode {
  const mapped = applicationToSarvamLanguage[language];
  if (!mapped) {
    throw new Error(`Unsupported language: ${language}`);
  }
  return mapped;
}

export function getSarvamApiKey(): string {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error("SARVAM_API_KEY is not configured");
  }
  return apiKey;
}

export async function transcribeWithSarvam(audioBuffer: ArrayBuffer, languageCode: SarvamLanguageCode): Promise<string> {
  const apiKey = getSarvamApiKey();

  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/webm" });
  formData.append("file", blob, "audio.webm");
  formData.append("model", "saaras:v4");
  formData.append("mode", "transcribe");
  formData.append("language_code", languageCode);

  const response = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sarvam STT failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { transcript?: string };
  const transcript = data.transcript?.trim();
  if (!transcript) {
    throw new Error("Sarvam returned an empty transcript");
  }
  return transcript;
}

export async function speakWithSarvam(text: string, languageCode: SarvamLanguageCode): Promise<{ audioBase64: string; contentType: string }> {
  const apiKey = getSarvamApiKey();

  const trimmedText = text.trim();
  if (!trimmedText) {
    throw new Error("Text is required for speech synthesis");
  }

  const requestBody = {
    text: trimmedText,
    language_code: languageCode,
    model: "bulbul:v3",
    speaker: "priya",
    pace: 0.9,
    speech_sample_rate: 24000,
    output_audio_codec: "mp3",
  };

  const response = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sarvam TTS failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { audios?: string[] };
  const audioBase64 = data.audios?.[0];
  if (!audioBase64) {
    throw new Error("Sarvam returned no audio");
  }
  return { audioBase64, contentType: "audio/mpeg" };
}
