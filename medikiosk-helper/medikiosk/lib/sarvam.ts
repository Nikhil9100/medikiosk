export type AppLanguage = "en"|"hi"|"bn"|"te"|"ta"|"mr";
const map: Record<AppLanguage,string> = { en:"en-IN", hi:"hi-IN", bn:"bn-IN", te:"te-IN", ta:"ta-IN", mr:"mr-IN" };
export function mapLanguage(value:string): AppLanguage { if(value in map) return value as AppLanguage; throw new Error(`Unsupported language: ${value}`); }
function key(){ const value=process.env.SARVAM_API_KEY; if(!value) throw new Error("SARVAM_API_KEY is not configured"); return value; }
export async function transcribe(audio: ArrayBuffer, language: AppLanguage){
  const fd = new FormData(); fd.append("file", new Blob([audio], {type:"audio/webm"}), "speech.webm"); fd.append("model","saaras:v4"); fd.append("mode","transcribe"); fd.append("language_code",map[language]);
  const r=await fetch("https://api.sarvam.ai/speech-to-text",{method:"POST",headers:{"api-subscription-key":key()},body:fd}); if(!r.ok) throw new Error(`STT unavailable (${r.status})`); const d=await r.json() as {transcript?:string}; if(!d.transcript?.trim()) throw new Error("Empty transcript"); return d.transcript.trim();
}
export async function speak(text:string, language:AppLanguage){
  const r=await fetch("https://api.sarvam.ai/text-to-speech",{method:"POST",headers:{"api-subscription-key":key(),"content-type":"application/json"},body:JSON.stringify({text:text.trim(),language_code:map[language],model:"bulbul:v3",speaker:"priya",pace:0.9,speech_sample_rate:24000,output_audio_codec:"mp3"})});
  if(!r.ok) throw new Error(`TTS unavailable (${r.status})`); const d=await r.json() as {audios?:string[]}; if(!d.audios?.[0]) throw new Error("No audio returned"); return {audioBase64:d.audios[0],contentType:"audio/mpeg",speaker:"priya"};
}
