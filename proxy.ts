import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_OPTIONS, hasAuthCookie } from "@/server/supabase/cookie-options";

/**
 * Keeps a guest's Supabase session alive: when the short-lived access token has
 * expired, refresh it here (Server Components can't write cookies) and pass the
 * new cookies both to this request and back to the browser. Visitors who have
 * never unlocked an adventure have no auth cookie and skip this entirely.
 */
export async function proxy(request: NextRequest) {
  if (!hasAuthCookie(request.cookies.getAll().map((c) => c.name))) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        // Responses that set auth cookies must never be cached by a CDN.
        for (const [header, value] of Object.entries(headers)) response.headers.set(header, value);
      },
    },
  });

  // Verifies the token and refreshes it if it has expired. Don't add code between
  // creating the client and this call.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  // Pages and Server Actions; not static files, images, icons or the manifest.
  matcher: ["/((?!_next/static|_next/image|icons/|icon.svg|apple-icon.png|manifest.webmanifest|favicon.ico).*)"],
};
