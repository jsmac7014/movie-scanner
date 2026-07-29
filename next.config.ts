import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["got-scraping", "header-generator", "got"],
};

export default nextConfig;