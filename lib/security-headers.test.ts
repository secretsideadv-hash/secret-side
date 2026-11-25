import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./security-headers";

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
    expect(directive(csp, "connect-src")).toEqual(["'self'"]);
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "form-action")).toEqual(["'self'"]);
  });

  it("never allows eval in production, only in development", () => {
    expect(csp).not.toContain("unsafe-eval");
    expect(directive(contentSecurityPolicy({ dev: true }), "script-src")).toContain("'unsafe-eval'");
  });

  it("allows no third-party origins (Mapbox is added deliberately in M3)", () => {
    expect(csp).not.toMatch(/https?:|\*/);
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
