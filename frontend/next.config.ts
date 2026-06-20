import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.weather-ai.co",
        pathname: "/icons/**",
      },
    ],
  },
};

export default nextConfig;
