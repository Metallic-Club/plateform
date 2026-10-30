import type { NextConfig } from "next";

/*
 * Headers that are the same on every response. The Content-Security-Policy
 * needs a per-request nonce, so it is set in src/proxy.ts instead.
 */
const securityHeaders = [
  // Two years. The site is served over https only (plateform #7, section 5).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // frame-ancestors 'none' in the CSP does the same for current browsers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // assistant's call: plain dynamic rendering for v1. The root layout reads
  // cookies and the user agent (theme, launcher shell), and the CSP nonce needs
  // a render per request anyway. Revisit once the real API and caching rules exist.
  poweredByHeader: false,
  reactStrictMode: true,
  devIndicators: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
