import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@usopc/shared", "@usopc/core"],
  serverExternalPackages: ["sst"],
  // Turbopack config (Next.js 16 default bundler)
  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },
  // Webpack fallback for production builds
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
