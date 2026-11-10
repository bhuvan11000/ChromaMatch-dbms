/**
 * Security response headers — Architecture §5.13.4.
 *
 * The CSP follows Next.js's documented non-nonce configuration: framework and
 * page scripts are emitted inline, so `'unsafe-inline'` is required unless the
 * app moves to a nonce/proxy setup. Development also needs `'unsafe-eval'` for
 * React's debugging transforms and WebSocket origins for HMR.
 */

export interface SecurityHeaderOptions {
  isDevelopment: boolean;
  isProduction: boolean;
}

export interface SecurityHeader {
  key: string;
  value: string;
}

export const PERMISSIONS_POLICY =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=()" as const;

/** Builds the CSP header value; kept pure so it is unit-testable. */
export function buildContentSecurityPolicy(options: SecurityHeaderOptions): string {
  const scriptSrc = ["'self'", "'unsafe-inline'"];
  if (options.isDevelopment) {
    scriptSrc.push("'unsafe-eval'");
  }

  const connectSrc = ["'self'"];
  if (options.isDevelopment) {
    // Next.js dev/HMR uses same-origin WebSockets, which CSP does not treat as
    // `'self'` in every browser.
    connectSrc.push("ws:", "wss:");
  }

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connectSrc.join(" ")}`,
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
  ];

  if (options.isProduction) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

/** Returns the complete set of hardening headers applied to every route. */
export function buildSecurityHeaders(options: SecurityHeaderOptions): SecurityHeader[] {
  return [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(options),
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
    {
      key: "Permissions-Policy",
      value: PERMISSIONS_POLICY,
    },
  ];
}
