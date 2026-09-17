import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("MEDIKIOSK"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  SARVAM_API_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
