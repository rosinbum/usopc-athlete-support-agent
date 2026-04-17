import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    // ESM .js extension resolution — mirrors the webpack extensionAlias from next.config.ts
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },
  // Load .env.local from the monorepo root
  envDir: "../..",
  server: {
    port: 3000,
  },
  ssr: {
    noExternal: ["@usopc/shared", "@usopc/core"],
    // Google Cloud SDKs use CommonJS internals (__dirname, dynamic requires)
    // that break when bundled into ESM. Keep them external so Node loads them
    // from node_modules with CJS resolution at runtime.
    external: [
      "@google-cloud/pubsub",
      "@google-cloud/storage",
      "google-gax",
      "google-auth-library",
      "google-proto-files",
      "@grpc/grpc-js",
      "@grpc/proto-loader",
    ],
  },
});
