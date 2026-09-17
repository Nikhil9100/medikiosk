export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export const SUPPORTED_MIME = ["application/pdf","image/png","image/jpeg","image/webp","image/bmp","image/tiff"] as const;
export function detectMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 5 && bytes[0]===0x25 && bytes[1]===0x50 && bytes[2]===0x44 && bytes[3]===0x46 && bytes[4]===0x2d) return "application/pdf";
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return "image/png";
  if (bytes.length >= 3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP") return "image/webp";
  if (bytes.length >= 2 && bytes[0]===0x42 && bytes[1]===0x4d) return "image/bmp";
  if (bytes.length >= 4 && ((bytes[0]===0x49&&bytes[1]===0x49&&bytes[2]===0x2a&&bytes[3]===0x00)||(bytes[0]===0x4d&&bytes[1]===0x4d&&bytes[2]===0x00&&bytes[3]===0x2a))) return "image/tiff";
  return null;
}
