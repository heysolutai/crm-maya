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
  images: {
    // Permite carregar imagens hospedadas no Backblaze B2, S3 e CDNs genericos.
    // Sem isso, qualquer <Image src="https://..."> com host externo retorna 400
    // e renderiza vazio (afeta logo da empresa, avatar do cliente, midia inline).
    remotePatterns: [
      { protocol: "https", hostname: "**.backblazeb2.com" },
      { protocol: "https", hostname: "**.b2cdn.com" },
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.cloudfront.net" },
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
    ],
  },
};

export default withSerwist(nextConfig);
