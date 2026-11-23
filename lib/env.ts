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
