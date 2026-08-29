import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright's webServer polls 127.0.0.1 (not localhost) for readiness —
  // without this, dev-mode HMR/static chunks are blocked as cross-origin,
  // breaking client-side hydration for e2e runs.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
