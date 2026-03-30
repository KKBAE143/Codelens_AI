import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  allowedDevOrigins: ["http://localhost:*"],
  devIndicators: false,
};

export default nextConfig;
