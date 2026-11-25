import "server-only";

import type { Id, Session } from "@/features/engine/types";
import { SESSION_SELECT, sessionFromRow, sessionToRows, type StoredSession } from "./session-rows";
import { supabaseAdmin } from "./supabase/admin";

/**
 * Sessions in Supabase (`sessions` + `session_stops`). Uses the secret key, so
 * EVERY read is scoped by the verified owner id passed in by server/play.ts;
 * guests can't write these tables at all (RLS + no grants).
 */

export type { StoredSession } from "./session-rows";

/** One of the owner's sessions, or null if it doesn't exist or isn't theirs. */
export async function loadOwnSession(sessionId: Id, ownerId: Id): Promise<StoredSession | null> {
  const { data, error } = await supabaseAdmin()
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("id", sessionId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(`loadOwnSession failed: ${error.message}`);
  return data ? sessionFromRow(data) : null;
}

/** The owner's unfinished session: for one experience, or their most recent overall. */
export async function loadUnfinishedSession(ownerId: Id, experienceId?: Id): Promise<StoredSession | null> {
  let query = supabaseAdmin()
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("owner_id", ownerId)
    .neq("status", "completed");
  if (experienceId) query = query.eq("experience_id", experienceId);
  const { data, error } = await query.order("last_activity_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`loadUnfinishedSession failed: ${error.message}`);
  return data ? sessionFromRow(data) : null;
}

/**
 * Inserts a new session at version 0. If the owner already has an unfinished
 * session for that experience, returns that one's id instead (race-safe: the
 * database's partial unique index decides).
 */
export async function createSession(session: Session, ownerId: Id): Promise<Id> {
  const { data, error } = await supabaseAdmin().rpc("create_session", sessionToRows(session, ownerId));
  if (error || !data) throw new Error(`createSession failed: ${error?.message ?? "no id returned"}`);
  return data;
}

/**
 * Writes the session only if it is still at `expectedVersion`. Returns the new
 * version, or null if the stored session moved on (stale request or replay);
 * in that case nothing was written.
 */
export async function saveSession(session: Session, ownerId: Id, expectedVersion: number): Promise<number | null> {
  const { data, error } = await supabaseAdmin().rpc("save_session", {
    ...sessionToRows(session, ownerId),
    expected_version: expectedVersion,
  });
  if (error) throw new Error(`saveSession failed: ${error.message}`);
  return data ?? null;
}
