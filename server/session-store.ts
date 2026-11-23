import "server-only";

// MOCK: cookie-backed session store for M1. Replaced by Supabase (sessions +
// session_stops tables, anonymous auth) in M2. Limits: one active session per
// browser, no group play, and a player could restore an older cookie (which only
// affects their own just-for-fun score).

import { cookies } from "next/headers";
import type { Session } from "@/features/engine/types";
import { serverEnv } from "@/lib/env";
import { decodeSession, encodeSession } from "./session-codec";

const COOKIE_NAME = "ss_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** Readable from Server Components, Server Functions and Route Handlers. */
export async function loadSession(sessionId: string): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = decodeSession(token, serverEnv().SESSION_SECRET);
  return session?.id === sessionId ? session : null;
}

/** Server Functions / Route Handlers only (Next can't set cookies during render). */
export async function saveSession(session: Session): Promise<void> {
  (await cookies()).set(COOKIE_NAME, encodeSession(session, serverEnv().SESSION_SECRET), {
    httpOnly: true, // not readable from JavaScript
    secure: process.env.NODE_ENV === "production", // dev is plain http over the LAN
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}
