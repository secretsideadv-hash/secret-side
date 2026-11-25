import { describe, expect, it } from "vitest";
import { MAP_TILE_ORIGIN, contentSecurityPolicy, securityHeaders } from "./security-headers";

const directive = (csp: string, name: string) =>
  csp
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.split(" ")
    .slice(1);

describe("security headers", () => {
  const csp = contentSecurityPolicy({ dev: false });

  it("only allows our own origin for scripts, connections and frames", () => {
    expect(directive(csp, "default-src")).toEqual(["'self'"]);
    expect(directive(csp, "script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directive(csp, "connect-src")).toEqual(["'self'", MAP_TILE_ORIGIN]);
    expect(directive(csp, "worker-src")).toEqual(["'self'"]); // MapLibre's worker is served by us
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "form-action")).toEqual(["'self'"]);
  });

  it("never allows eval in production, only in development", () => {
    expect(csp).not.toContain("unsafe-eval");
    expect(directive(contentSecurityPolicy({ dev: true }), "script-src")).toContain("'unsafe-eval'");
  });

  it("allows exactly one third-party origin, the map tiles, and only for connections", () => {
    const origins = [...csp.matchAll(/https?:\/\/[^\s;]+/g)].map((m) => m[0]);
    expect(origins).toEqual([MAP_TILE_ORIGIN]);
    expect(MAP_TILE_ORIGIN).toBe("https://tiles.openfreemap.org");
    expect(csp).not.toContain("*");
    for (const name of ["script-src", "frame-ancestors", "img-src", "worker-src", "font-src", "style-src"]) {
      expect(directive(csp, name), name).not.toContain(MAP_TILE_ORIGIN);
    }
  });

  it("sends the standard hardening headers", () => {
    const headers = Object.fromEntries(securityHeaders({ dev: false }).map((h) => [h.key, h.value]));
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Strict-Transport-Security"]).toMatch(/max-age=\d{8}/);
    expect(headers["Permissions-Policy"]).toContain("geolocation=(self)");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
  });
});
