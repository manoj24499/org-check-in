import type { NextConfig } from "next";

// script-src/style-src include 'unsafe-inline' as a deliberate, documented
// trade-off: Next.js's App Router streams React Server Component payloads
// via inline `<script>` tags it injects itself (the `self.__next_f.push(...)`
// pattern), and this app uses inline `style={{...}}` props in a few
// components (the Leaflet map wrappers, Logo.tsx) — a strict CSP without
// this would break hydration/streaming and those inline styles. Closing
// this fully needs a per-request nonce threaded through middleware (Next's
// documented pattern), which is a larger, separate change; everything else
// below is fully locked down without that trade-off.
// React's dev mode (never production, per React's own console message) uses
// eval() for debugging features like reconstructing cross-environment call
// stacks — without this, every dev-mode page load logs a scary-looking but
// harmless CSP console error. Scoped to development only so the production
// policy stays fully strict.
const isDev = process.env.NODE_ENV === "development";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.tile.openstreetmap.org https://unpkg.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP },
  // Belt-and-suspenders alongside frame-ancestors above — older browsers
  // that don't support frame-ancestors still get clickjacking protection.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Vercel always serves over HTTPS; this just tells browsers to remember
  // that and skip the initial plaintext-HTTP round trip on repeat visits.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
