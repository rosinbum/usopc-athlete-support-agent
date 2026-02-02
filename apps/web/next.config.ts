import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@usopc/shared", "@usopc/core"],
  serverExternalPackages: ["sst"],
};

export default nextConfig;
