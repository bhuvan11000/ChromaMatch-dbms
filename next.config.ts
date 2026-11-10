import type { NextConfig } from "next";

import { buildSecurityHeaders } from "./src/lib/config/securityHeaders";

const isDevelopment = process.env.NODE_ENV === "development";
const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: buildSecurityHeaders({ isDevelopment, isProduction }),
      },
    ];
  },
};

export default nextConfig;
