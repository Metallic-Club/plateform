import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // assistant's call: plain dynamic rendering for v1. The root layout reads
  // cookies (theme, launcher shell), which Cache Components would force behind
  // Suspense. Revisit once the real API and caching rules exist.
  poweredByHeader: false,
  reactStrictMode: true,
  devIndicators: false,
};

export default nextConfig;
