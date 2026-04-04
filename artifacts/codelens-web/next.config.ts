import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  allowedDevOrigins: ["*"],
  devIndicators: false,
  experimental: {
    nodeMiddleware: true,
  },
};

export default nextConfig;
