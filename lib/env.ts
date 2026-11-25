import "server-only";

import { z } from "zod";

const supabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    error: "NEXT_PUBLIC_SUPABASE_URL is missing or not a URL (https://<project-ref>.supabase.co).",
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string({ error: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing." })
    .startsWith("sb_publishable_", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be the publishable key (sb_publishable_…)."),
  SUPABASE_SECRET_KEY: z
    .string({ error: "SUPABASE_SECRET_KEY is missing." })
    .startsWith("sb_secret_", "SUPABASE_SECRET_KEY must be the secret key (sb_secret_…)."),
});

export type SupabaseEnv = z.infer<typeof supabaseEnvSchema>;

let cachedSupabase: SupabaseEnv | undefined;

/** Supabase settings for server code. Read lazily so `next build` works without secrets; fails loudly on first use. */
export function supabaseEnv(): SupabaseEnv {
  cachedSupabase ??= supabaseEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
  return cachedSupabase;
}
