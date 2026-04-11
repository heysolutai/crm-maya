import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output as standalone for Docker deployment
  output: "standalone",
  eslint: {
    // Nao bloquear o build por warnings/errors do ESLint
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
