/**
 * HTTP security headers for every response (next.config.ts → headers()).
 *
 * The Content-Security-Policy is static, without nonces: nonces need every
 * page rendered per request, which would remove our prerendered and partially
 * prerendered pages. So inline scripts and styles (Next's bootstrap, React
 * style attributes) are allowed, but nothing may load from, connect to or
 * frame other origins. The browser never talks to Supabase directly: game
 * calls are Server Actions on our own origin.
 *
 * The one third-party origin is the map: MapLibre fetches OpenFreeMap vector
 * tiles, fonts and sprites from MAP_TILE_ORIGIN (connect-src only; no scripts,
 * no frames). MapLibre's worker and our style file are served from our own origin.
 */

type Directives = Record<string, string[]>;

/** OpenFreeMap: vector tiles, glyphs and sprites for the map (no key, no cookies). */
export const MAP_TILE_ORIGIN = "https://tiles.openfreemap.org";

export function contentSecurityPolicy({ dev }: { dev: boolean }): string {
  const directives: Directives = {
    "default-src": ["'self'"],
    // 'unsafe-eval' only in development (React Refresh / dev overlay).
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"], // next/font self-hosts the fonts
    "connect-src": ["'self'", MAP_TILE_ORIGIN],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function securityHeaders({ dev }: { dev: boolean }): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ dev }) },
    // HTTPS only for two years (ignored by browsers on plain-http localhost).
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" }, // older browsers; frame-ancestors covers the rest
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Location is ours to ask for (GPS check-in, emergency view); nothing else.
    { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), browsing-topics=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}
