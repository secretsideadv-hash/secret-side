import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  SESSION_SECRET: z
    .string({ error: "SESSION_SECRET is missing. Copy .env.example to .env.local and set it." })
    .min(32, "SESSION_SECRET must be at least 32 characters (use 32 random bytes, base64)."),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Read lazily so `next build` works without secrets; fails loudly on first use. */
export function serverEnv(): ServerEnv {
  cached ??= serverEnvSchema.parse({ SESSION_SECRET: process.env.SESSION_SECRET });
  return cached;
}

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

/** Supabase settings for server code. Lazy, like serverEnv(). */
export function supabaseEnv(): SupabaseEnv {
  cachedSupabase ??= supabaseEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
  return cachedSupabase;
}
