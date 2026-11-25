import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Supabase auth cookies (the guest's session). httpOnly so page scripts can't
 * read the refresh token; the browser never needs it (all game calls are server
 * actions). Shared by server/supabase/auth.ts and proxy.ts so both write the
 * same cookies. M4 realtime must get its token another way, not by relaxing this.
 */
export const AUTH_COOKIE_OPTIONS: CookieOptionsWithName = {
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production", // dev runs over plain http on the LAN
  maxAge: 400 * 24 * 60 * 60, // browsers cap cookie lifetime at 400 days
};

/** Supabase names its auth cookies sb-<project-ref>-auth-token (split into .0, .1… when long). */
export const hasAuthCookie = (names: Iterable<string>) => {
  for (const name of names) if (name.startsWith("sb-") && name.includes("-auth-token")) return true;
  return false;
};
