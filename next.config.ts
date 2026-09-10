import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Kiosk QA tooling (Playwright) loads the app over http://127.0.0.1:3000.
  // Without this, Next.js blocks dev resources (HMR/client chunks) from that
  // origin and client hydration never completes.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
