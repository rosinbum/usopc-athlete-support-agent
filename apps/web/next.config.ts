import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@usopc/shared", "@usopc/core"],
  serverExternalPackages: ["sst"],
  // Use webpack for ESM .js extension resolution in workspace packages
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
