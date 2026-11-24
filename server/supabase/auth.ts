import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Publishable-key client bound to this request's auth cookies: who the guest is
 * (anonymous sign-in from M2-4) and nothing more than RLS allows them. Create one
 * per request; never share it between requests.
 */
export async function supabaseAuth() {
  const cookieStore = await cookies();
  const env = supabaseEnv();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies. Server Actions can; token refresh
          // for page loads moves into proxy.ts with guest sign-in (M2-4).
        }
      },
    },
  });
}
