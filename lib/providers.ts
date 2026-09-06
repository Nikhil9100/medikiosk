export type ProviderStatus = "configured" | "missing" | "error";

export type ProviderConfig = {
  name: string;
  status: ProviderStatus;
  endpoint?: string;
};

export function getProviderStatus(name: string, configured: boolean): ProviderStatus {
  return configured ? "configured" : "missing";
}

export const providerCatalog: ProviderConfig[] = [
  { name: "Gemini", status: getProviderStatus("Gemini", Boolean(process.env.GEMINI_API_KEY)) },
  { name: "Sarvam", status: getProviderStatus("Sarvam", Boolean(process.env.SARVAM_API_KEY)) },
  { name: "Supabase", status: getProviderStatus("Supabase", Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)) },
];
