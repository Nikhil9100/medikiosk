import { createBrowserClient } from "@supabase/ssr";

function getPublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase public configuration is missing");
  }
  return { url, key };
}

export function createSupabaseBrowserClient() {
  const { url, key } = getPublicConfig();
  return createBrowserClient(url, key);
}
