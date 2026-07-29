import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    "got-scraping",
    "header-generator",
    "got",
    "http2-wrapper",
    "mimic-response",
    "ow",
    "quick-lru",
  ],
};

export default nextConfig;