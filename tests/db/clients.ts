/**
 * Clients for the database tests. They only ever talk to the DEV project
 * (secret-side-dev); the guards below refuse anything else.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { expect } from "vitest";

export const DEV_PROJECT_REF = "rekuyorpqcszmwkiwcsz";

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing from .env.local (database tests need the dev project keys).`);
  return value;
}

function devUrl(): string {
  const url = need("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes(DEV_PROJECT_REF)) {
    throw new Error(`Database tests run only against the dev project (${DEV_PROJECT_REF}), not ${url}.`);
  }
  return url;
}

const noPersist = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** Secret key: bypasses RLS. Used only to seed and clean up fixtures. */
export const adminClient = (): SupabaseClient => createClient(devUrl(), need("SUPABASE_SECRET_KEY"), noPersist);

/** Publishable key, nobody signed in (role `anon`). */
export const anonClient = (): SupabaseClient =>
  createClient(devUrl(), need("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), noPersist);

/** Publishable key, signed in as a fresh anonymous guest (role `authenticated`). */
export async function guestClient(): Promise<{ client: SupabaseClient; userId: string }> {
  const client = anonClient();
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw new Error(`Anonymous sign-in failed: ${error?.message}`);
  return { client, userId: data.user.id };
}

/** Direct Postgres connection to dev as `postgres` (schema probes and audits). */
export async function devPostgres(): Promise<PgClient> {
  const url = need("SUPABASE_DEV_DB_URL");
  if (!url.includes(DEV_PROJECT_REF)) throw new Error("SUPABASE_DEV_DB_URL is not the dev project.");
  // Dev-only test connection; the pooler's certificate chain isn't in Node's CA store.
  const client = new PgClient({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

type Result = { data: unknown; error: { code?: string; message: string } | null };

/** Postgres "insufficient privilege": the role has no grant at all. */
export function expectDenied(result: Result, what: string) {
  expect(result.error?.code, `${what} should be denied, got ${JSON.stringify(result.data ?? result.error)}`).toBe(
    "42501",
  );
  expect(result.data ?? null).toBeNull();
}

/** Allowed to ask, but RLS returns nothing. */
export function expectNoRows(result: Result, what: string) {
  expect(result.error, `${what}: ${result.error?.message}`).toBeNull();
  expect(result.data, what).toEqual([]);
}
