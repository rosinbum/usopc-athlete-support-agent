import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@usopc/shared", "@usopc/core"],
  serverExternalPackages: ["sst"],
  webpack: (config) => {
    // Resolve .js imports to .ts files for workspace packages using ESM with .js extensions
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
