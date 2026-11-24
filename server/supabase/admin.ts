import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

let client: SupabaseClient<Database> | undefined;

/**
 * Secret-key client. It BYPASSES Row Level Security, so it exists only here
 * (server-only) and every session query made with it must be scoped by the
 * verified user id. Supabase also rejects secret keys sent from a browser.
 */
export function supabaseAdmin(): SupabaseClient<Database> {
  if (!client) {
    const env = supabaseEnv();
    client = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}
