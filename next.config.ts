import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Nao registrar automaticamente em dev pra nao atrapalhar hot reload
  disable: process.env.NODE_ENV === "development",
  // Rotas que nao devem ser cacheadas pelo SW
  exclude: [
    /\/api\/webhooks\//,
    /\/api\/conversations\/events/,
    /\/api\/cron\//,
  ],
});

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default withSerwist(nextConfig);
