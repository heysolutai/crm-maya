import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output as standalone for Docker deployment
  output: "standalone",

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "szqykxatrokbkobitgkg.supabase.co",
        pathname: "/storage/**",
      },
    ],
  },
};

export default nextConfig;
