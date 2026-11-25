import "server-only";

import { cookies } from "next/headers";
import type { Id } from "@/features/engine/types";
import { hasAuthCookie } from "./supabase/cookie-options";
import { supabaseAuth } from "./supabase/auth";

/**
 * Who is playing. A guest is a Supabase anonymous user created on their first
 * "Unlock adventure"; the auth cookies keep them signed in across browser
 * restarts. Later (M6) the same user id can be upgraded to a real account.
 */

/** The verified guest id for this request, or null. Never creates a user. */
export async function currentGuestId(): Promise<Id | null> {
  const store = await cookies();
  if (!hasAuthCookie(store.getAll().map((c) => c.name))) return null; // no cookie: no network call
  const supabase = await supabaseAuth();
  // getClaims() verifies the access token's signature (it doesn't trust the cookie).
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) return null;
  return data.claims.sub;
}

/** Server Actions only (sets cookies): the current guest, signing in anonymously if needed. */
export async function ensureGuest(): Promise<Id> {
  const existing = await currentGuestId();
  if (existing) return existing;
  const supabase = await supabaseAuth();
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) throw new Error(`Guest sign-in failed: ${error?.message ?? "no user"}`);
  return data.user.id;
}
