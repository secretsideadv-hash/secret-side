import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Publishable-key client for the browser (group realtime, M4). It can read only
 * what RLS grants guests: published experiences and their own session progress.
 * Never import the secret key or server/supabase/* from client code.
 */
export function supabaseBrowser() {
  // Literal process.env reads so Next inlines the public values at build time.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set");
  return createBrowserClient<Database>(url, key);
}
