import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import { AUTH_COOKIE_OPTIONS } from "./cookie-options";

/**
 * Publishable-key client bound to this request's auth cookies: who the guest is
 * and nothing more than RLS allows them. Create one per request; never share it.
 * Token refresh on page loads happens in proxy.ts (Server Components can't set
 * cookies); Server Actions can, so sign-in happens there.
 */
export async function supabaseAuth() {
  const cookieStore = await cookies();
  const env = supabaseEnv();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: proxy.ts already refreshed the cookies.
        }
      },
    },
  });
}
