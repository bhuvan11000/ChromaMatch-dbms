import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  PERMISSIONS_POLICY,
} from "@/lib/config/securityHeaders";

type Headers = ReturnType<typeof buildSecurityHeaders>;

function headerValue(headers: Headers, key: string): string | undefined {
  return headers.find((header) => header.key === key)?.value;
}

describe("buildSecurityHeaders", () => {
  const headers = buildSecurityHeaders({ isDevelopment: false, isProduction: true });

  it("sets the required response hardening headers", () => {
    expect(headerValue(headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(headerValue(headers, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headerValue(headers, "X-Frame-Options")).toBe("DENY");
    expect(headerValue(headers, "Permissions-Policy")).toBe(PERMISSIONS_POLICY);
    expect(headerValue(headers, "Content-Security-Policy")).toBeTruthy();
  });

  it("denies framing in both the legacy header and CSP", () => {
    expect(headerValue(headers, "X-Frame-Options")).toBe("DENY");
    expect(headerValue(headers, "Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("keeps the permissions policy minimal", () => {
    expect(PERMISSIONS_POLICY).toBe("camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  });
});

describe("buildContentSecurityPolicy", () => {
  it("allows the inline scripts and styles Next.js emits", () => {
    const csp = buildContentSecurityPolicy({ isDevelopment: false, isProduction: true });

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("does not allow eval in production", () => {
    const csp = buildContentSecurityPolicy({ isDevelopment: false, isProduction: true });

    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("ws:");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("adds eval and WebSocket origins for development HMR", () => {
    const csp = buildContentSecurityPolicy({ isDevelopment: true, isProduction: false });

    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
