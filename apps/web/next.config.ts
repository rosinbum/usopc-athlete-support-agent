import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@usopc/shared", "@usopc/core"],
};

export default nextConfig;
